"""Regression tests for code-quality fixes:
- /api/files 404 guard
- /api/auth/logout + last_logout/last_login on admin/members list
- Resume parse: total_experience + is_duplicate
- /api/job-tracking CRUD + ?date filter + admin sees all with user_name
- /api/bd/daily (3 leads) + admin /api/bd/daily/all
- /api/celebrations: ddmm field dd/mm format
"""
import os
import re
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")


# ---------- Admin login/logout timestamps ----------
class TestAuthLogout:
    def test_logout_endpoint(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_members_list_has_last_login_fields(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/members")
        assert r.status_code == 200
        members = r.json()
        # fields should be present even if None
        for m in members[:5]:
            assert "last_login" in m
            assert "last_logout" in m


# ---------- /api/files 404 guard ----------
class TestFilesGuard:
    def test_files_invalid_path_returns_404(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/files",
            params={"path": "resumes/does-not-exist-xyz-987654321.pdf", "auth": admin_token},
            timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_files_no_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/files", params={"path": "foo"}, timeout=15)
        assert r.status_code == 401


# ---------- Resume parse duplicate + total_experience ----------
PARSED = {"id": None, "resume_path": None}


class TestResumeDuplicate:
    def test_parse_resume_fields(self, admin_token, sample_pdf_bytes):
        files = {"file": ("TEST_reg_resume.pdf", sample_pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{BASE_URL}/api/resumes/parse", headers=headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert "total_experience" in doc
        assert "is_duplicate" in doc
        PARSED["id"] = doc["id"]
        PARSED["resume_path"] = doc.get("resume_path")

    def test_parse_same_resume_flags_duplicate(self, admin_token, sample_pdf_bytes):
        if not PARSED["id"]:
            pytest.skip("prior parse failed")
        files = {"file": ("TEST_reg_resume2.pdf", sample_pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{BASE_URL}/api/resumes/parse", headers=headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        doc = r.json()
        # Second upload with same email should flag duplicate
        assert doc.get("is_duplicate") is True, f"expected duplicate flag true: {doc}"

    def test_download_valid_resume_path_200(self, admin_token):
        if not PARSED["resume_path"]:
            pytest.skip("no resume path")
        r = requests.get(
            f"{BASE_URL}/api/files",
            params={"path": PARSED["resume_path"], "auth": admin_token},
            timeout=30,
        )
        assert r.status_code == 200
        assert len(r.content) > 50


# ---------- BD daily ----------
class TestBDDaily:
    def test_bd_daily_returns_3_leads(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/bd/daily", timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "leads" in data
        assert isinstance(data["leads"], list)
        # Spec says 3 leads
        assert len(data["leads"]) == 3, f"expected 3 leads got {len(data['leads'])}"

    def test_bd_daily_all_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/bd/daily/all", timeout=60)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            assert "user_name" in rows[0]
            assert "leads" in rows[0]


# ---------- Job Tracking ----------
JT_ID = {"id": None, "date": None}
MEMBER = {"jwt": None, "id": None, "email": None}


class TestJobTracking:
    def test_setup_member(self, admin_client, api):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_jt_{suffix}@example.com"
        r = admin_client.post(f"{BASE_URL}/api/admin/members", json={"name": f"TEST JT {suffix}", "email": email})
        assert r.status_code == 200
        tok = r.json()["invite_token"]
        MEMBER["id"] = r.json()["id"]
        MEMBER["email"] = email.lower()
        r2 = api.post(f"{BASE_URL}/api/auth/accept-invite", json={
            "token": tok, "password": "MemberPass@2026",
            "date_of_birth": "1993-02-14", "work_anniversary": "2022-04-01",
            "mobile": "+91-9000000111"})
        assert r2.status_code == 200
        MEMBER["jwt"] = r2.json()["token"]

    def test_member_create_own(self, api):
        if not MEMBER["jwt"]:
            pytest.skip("no member")
        r = api.post(f"{BASE_URL}/api/job-tracking",
                     headers={"Authorization": f"Bearer {MEMBER['jwt']}", "Content-Type": "application/json"},
                     json={"candidate_name": "TEST_JT_Cand", "total_experience": "6 years",
                           "organisation": "TEST_Co", "job_title": "SDE2",
                           "present_location": "BLR", "present_ctc": "20L", "notice_period": "60d"})
        assert r.status_code == 200, r.text
        d = r.json()
        JT_ID["id"] = d["id"]
        JT_ID["date"] = d["date"]
        assert d["user_id"] == MEMBER["id"]
        assert d["user_name"]

    def test_member_lists_own(self, api):
        if not MEMBER["jwt"]:
            pytest.skip()
        r = api.get(f"{BASE_URL}/api/job-tracking",
                    headers={"Authorization": f"Bearer {MEMBER['jwt']}"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert JT_ID["id"] in ids

    def test_admin_sees_all_with_user_name(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/job-tracking")
        assert r.status_code == 200
        rows = r.json()
        mine = [x for x in rows if x["id"] == JT_ID["id"]]
        assert mine, "admin cannot see member's entry"
        assert mine[0].get("user_name")

    def test_admin_date_filter(self, admin_client):
        if not JT_ID["date"]:
            pytest.skip()
        r = admin_client.get(f"{BASE_URL}/api/job-tracking", params={"date": JT_ID["date"]})
        assert r.status_code == 200
        rows = r.json()
        assert all(x["date"] == JT_ID["date"] for x in rows)
        assert JT_ID["id"] in [x["id"] for x in rows]

    def test_admin_date_filter_empty(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/job-tracking", params={"date": "1999-01-01"})
        assert r.status_code == 200
        assert r.json() == []


# ---------- Celebrations ddmm format ----------
class TestCelebrations:
    def test_ddmm_field_format(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/celebrations")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and items
        pat = re.compile(r"^\d{2}/\d{2}$")
        for it in items:
            assert "ddmm" in it, f"missing ddmm: {it}"
            assert pat.match(it["ddmm"]), f"bad ddmm format: {it['ddmm']}"


# ---------- Cleanup ----------
def test_zz_cleanup_reg(admin_client):
    if MEMBER.get("id"):
        admin_client.delete(f"{BASE_URL}/api/admin/members/{MEMBER['id']}")
    if PARSED.get("id"):
        admin_client.delete(f"{BASE_URL}/api/resumes/{PARSED['id']}")
