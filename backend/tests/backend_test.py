"""Career Buddha backend tests - full coverage of API endpoints."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")


# -------- Auth --------
class TestAuth:
    def test_login_success(self, admin_token):
        assert admin_token
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_invalid(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "nouser@x.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "admin"
        assert data["email"]

    def test_me_unauthorized(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)

    def test_heartbeat(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/heartbeat")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_change_password_wrong_current(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/auth/change-password",
                              json={"current_password": "wrong_pw",
                                    "new_password": "SomethingNew@2026"})
        assert r.status_code == 400

    def test_google_session_bad_id(self, api):
        r = api.post(f"{BASE_URL}/api/auth/google/session",
                     json={"session_id": "invalid-session-xyz"})
        assert r.status_code == 401


# -------- Admin Members / Invite / Activation --------
MEMBER_IDS = []


class TestMembersAndInvite:
    def test_create_member(self, admin_client):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_member_{suffix}@example.com"
        r = admin_client.post(f"{BASE_URL}/api/admin/members",
                              json={"name": f"TEST Member {suffix}", "email": email})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email.lower()
        assert data["status"] == "invited"
        assert data["invite_token"]
        MEMBER_IDS.append({"id": data["id"], "token": data["invite_token"], "email": email.lower()})

    def test_list_members_contains_created(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/members")
        assert r.status_code == 200
        emails = [m["email"] for m in r.json()]
        assert MEMBER_IDS[0]["email"] in emails

    def test_duplicate_member_rejected(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/members",
                              json={"name": "dup", "email": MEMBER_IDS[0]["email"]})
        assert r.status_code == 400

    def test_get_invite(self, api):
        tok = MEMBER_IDS[0]["token"]
        r = api.get(f"{BASE_URL}/api/auth/invite/{tok}")
        assert r.status_code == 200
        assert r.json()["email"] == MEMBER_IDS[0]["email"]

    def test_regenerate_invite(self, admin_client):
        mid = MEMBER_IDS[0]["id"]
        r = admin_client.post(f"{BASE_URL}/api/admin/members/{mid}/regenerate-invite")
        assert r.status_code == 200
        new_token = r.json()["invite_token"]
        assert new_token and new_token != MEMBER_IDS[0]["token"]
        MEMBER_IDS[0]["token"] = new_token

    def test_accept_invite_and_login(self, api):
        tok = MEMBER_IDS[0]["token"]
        r = api.post(f"{BASE_URL}/api/auth/accept-invite",
                     json={"token": tok, "password": "MemberPass@2026",
                           "date_of_birth": "1992-07-15",
                           "work_anniversary": "2021-03-01",
                           "mobile": "+91-9000000001"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"] and data["user"]["role"] == "member"
        MEMBER_IDS[0]["jwt"] = data["token"]

        # verify can login now
        r2 = api.post(f"{BASE_URL}/api/auth/login",
                      json={"email": MEMBER_IDS[0]["email"], "password": "MemberPass@2026"})
        assert r2.status_code == 200
        MEMBER_IDS[0]["jwt"] = r2.json()["token"]

    def test_member_cannot_access_admin(self, api):
        jwt = MEMBER_IDS[0]["jwt"]
        r = api.get(f"{BASE_URL}/api/admin/members",
                    headers={"Authorization": f"Bearer {jwt}"})
        assert r.status_code == 403

    def test_member_online_after_heartbeat(self, admin_client, api):
        jwt = MEMBER_IDS[0]["jwt"]
        api.post(f"{BASE_URL}/api/heartbeat", headers={"Authorization": f"Bearer {jwt}"})
        time.sleep(1)
        r = admin_client.get(f"{BASE_URL}/api/admin/members")
        found = [m for m in r.json() if m["id"] == MEMBER_IDS[0]["id"]]
        assert found and found[0]["online"] is True


# -------- Features --------
class TestFeatures:
    def test_get_features(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/features")
        assert r.status_code == 200
        feats = r.json()
        assert "parse_resume" in feats
        assert isinstance(feats["parse_resume"], bool)

    def test_update_feature_toggle(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/features", json={"celebrations": False})
        assert r.status_code == 200
        assert r.json()["celebrations"] is False
        # revert
        r2 = admin_client.put(f"{BASE_URL}/api/features", json={"celebrations": True})
        assert r2.json()["celebrations"] is True

    def test_member_cannot_update_features(self, api):
        jwt = MEMBER_IDS[0]["jwt"]
        r = api.put(f"{BASE_URL}/api/features",
                    headers={"Authorization": f"Bearer {jwt}",
                             "Content-Type": "application/json"},
                    json={"celebrations": False})
        assert r.status_code == 403


# -------- Resume parse / search / files --------
CANDIDATE_ID = {"id": None, "resume_path": None}


class TestResumesAndFiles:
    def test_parse_resume(self, admin_token, sample_pdf_bytes):
        files = {"file": ("TEST_resume.pdf", sample_pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{BASE_URL}/api/resumes/parse",
                          headers=headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["id"]
        assert "name" in doc
        CANDIDATE_ID["id"] = doc["id"]
        CANDIDATE_ID["resume_path"] = doc.get("resume_path")
        # Expect ~17 fields extracted
        expected_fields = ["name", "email", "mobile_number", "city",
                           "present_company", "designation", "skill_sets"]
        for f in expected_fields:
            assert f in doc, f"missing field {f}"

    def test_search_resume_by_q(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/resumes", params={"q": "john"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_resume_by_id(self, admin_client):
        if not CANDIDATE_ID["id"]:
            pytest.skip("no candidate created")
        r = admin_client.get(f"{BASE_URL}/api/resumes/{CANDIDATE_ID['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == CANDIDATE_ID["id"]

    def test_download_file_with_auth_query(self, admin_token):
        if not CANDIDATE_ID["resume_path"]:
            pytest.skip("no resume path")
        r = requests.get(f"{BASE_URL}/api/files",
                         params={"path": CANDIDATE_ID["resume_path"], "auth": admin_token},
                         timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 100

    def test_download_file_without_auth(self):
        r = requests.get(f"{BASE_URL}/api/files",
                         params={"path": "foo/bar"}, timeout=30)
        assert r.status_code == 401

    def test_shared_candidate_visible_to_member(self, api):
        jwt = MEMBER_IDS[0]["jwt"] if MEMBER_IDS else None
        if not jwt:
            pytest.skip("no member")
        r = api.get(f"{BASE_URL}/api/resumes",
                    headers={"Authorization": f"Bearer {jwt}"})
        assert r.status_code == 200
        ids = [c.get("id") for c in r.json()]
        assert CANDIDATE_ID["id"] in ids


# -------- Clients CRUD --------
CLIENT_ID = {"id": None}


class TestClients:
    def test_create_client(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/clients",
                              json={"organisation_name": "TEST_Org_Alpha",
                                    "hr_person": "Jane", "hr_email": "jane@alpha.test",
                                    "hr_mobile": "+91-9900001111", "address": "BLR"})
        assert r.status_code == 200
        CLIENT_ID["id"] = r.json()["id"]

    def test_list_contains(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/clients")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert CLIENT_ID["id"] in ids

    def test_update_client(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/clients/{CLIENT_ID['id']}",
                             json={"organisation_name": "TEST_Org_Alpha_Edit",
                                   "hr_person": "Jane2", "hr_email": "jane2@alpha.test",
                                   "hr_mobile": "9", "address": "HYD"})
        assert r.status_code == 200

    def test_delete_client(self, admin_client):
        r = admin_client.delete(f"{BASE_URL}/api/clients/{CLIENT_ID['id']}")
        assert r.status_code == 200
        r2 = admin_client.get(f"{BASE_URL}/api/clients")
        assert CLIENT_ID["id"] not in [c["id"] for c in r2.json()]


# -------- Business Development --------
BD_ID = {"id": None}


class TestBD:
    def test_create_bd(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/bd",
                              json={"company": "TEST_BD_Co", "vacancy": "SDE",
                                    "location": "BLR"})
        assert r.status_code == 200
        BD_ID["id"] = r.json()["id"]

    def test_update_bd(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/bd/{BD_ID['id']}",
                             json={"company": "TEST_BD_Co", "status": "contacted"})
        assert r.status_code == 200

    def test_delete_bd(self, admin_client):
        r = admin_client.delete(f"{BASE_URL}/api/bd/{BD_ID['id']}")
        assert r.status_code == 200

    def test_bd_suggest(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/bd/suggest",
                              json={"company": "Microsoft"}, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert "suggestions" in data


# -------- Joinings --------
class TestJoinings:
    def test_member_creates_joining(self, api):
        jwt = MEMBER_IDS[0]["jwt"]
        r = api.post(f"{BASE_URL}/api/joinings",
                     headers={"Authorization": f"Bearer {jwt}",
                              "Content-Type": "application/json"},
                     json={"candidate_name": "TEST_Join_Cand",
                           "client_name": "ClientX", "status": "offered"})
        assert r.status_code == 200
        jid = r.json()["id"]

        # member sees own
        r2 = api.get(f"{BASE_URL}/api/joinings",
                     headers={"Authorization": f"Bearer {jwt}"})
        assert jid in [j["id"] for j in r2.json()]

    def test_admin_sees_all(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/joinings")
        assert r.status_code == 200
        names = [j.get("candidate_name") for j in r.json()]
        assert "TEST_Join_Cand" in names


# -------- Celebrations --------
class TestCelebrations:
    def test_celebrations(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/celebrations")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # member set DOB 1992-07-15; should show as Birthday / Team Member
        found = [i for i in items if i["who"] == "Team Member" and i["type"] == "Birthday"]
        assert found, "no team birthday found"


# -------- Cleanup --------
def test_zz_cleanup(admin_client):
    # delete created member
    for m in MEMBER_IDS:
        admin_client.delete(f"{BASE_URL}/api/admin/members/{m['id']}")
    if CANDIDATE_ID["id"]:
        admin_client.delete(f"{BASE_URL}/api/resumes/{CANDIDATE_ID['id']}")
