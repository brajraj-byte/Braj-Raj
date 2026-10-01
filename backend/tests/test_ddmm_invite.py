"""Tests for DD/MM invite activation flow and Celebrations integration."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "braj.raj@careerbuddha.in"
ADMIN_PASSWORD = "CareerBuddha@2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def member(admin_headers):
    email = f"TEST_ddmm_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"name": "TEST DDMM Member", "email": email, "role": "member"}
    r = requests.post(f"{BASE_URL}/api/admin/members", json=payload, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    token = data.get("invite_token")
    mid = data.get("id") or data.get("_id") or data.get("user_id")
    if not token:
        # fallback: list members and find it
        lst = requests.get(f"{BASE_URL}/api/admin/members", headers=admin_headers).json()
        for m in lst:
            if m.get("email") == email:
                token = m.get("invite_token")
                mid = m.get("id") or mid
                break
    assert token, f"no invite_token found. response: {data}"
    yield {"email": email, "invite_token": token, "id": mid}
    # cleanup
    if mid:
        requests.delete(f"{BASE_URL}/api/admin/members/{mid}", headers=admin_headers)


def test_invite_get(member):
    r = requests.get(f"{BASE_URL}/api/auth/invite/{member['invite_token']}")
    assert r.status_code == 200, r.text
    assert r.json()["email"].lower() == member["email"].lower()


def test_accept_invite_with_ddmm(member):
    r = requests.post(f"{BASE_URL}/api/auth/accept-invite", json={
        "token": member["invite_token"],
        "password": "MemberPass@2026",
        "date_of_birth": "15/08",
        "work_anniversary": "01/04",
        "mobile": "9999999999",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body
    member["member_token"] = body["token"]
    # verify /auth/me
    me = requests.get(f"{BASE_URL}/api/auth/me",
                      headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    me_data = me.json()
    assert me_data.get("date_of_birth") == "15/08"
    assert me_data.get("work_anniversary") == "01/04"


def test_celebrations_contains_ddmm_entry(member, admin_headers):
    r = requests.get(f"{BASE_URL}/api/celebrations", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    email_l = member["email"].lower()
    emails = [(i.get("sub","").lower(), i.get("ddmm"), i.get("type")) for i in items]
    assert (email_l, "15/08", "Birthday") in emails, f"missing birthday 15/08 for {email_l}: {emails}"
    assert (email_l, "01/04", "Work Anniversary") in emails


def test_login_as_new_member(member):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": member["email"], "password": "MemberPass@2026"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_admin_login_regression():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert "token" in r.json()


def test_celebrations_still_has_candidate_entries(admin_headers):
    r = requests.get(f"{BASE_URL}/api/celebrations", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    cand_items = [i for i in items if i.get("who") == "Candidate"]
    # expect at least one candidate entry with dd/mm formatted ddmm
    assert len(cand_items) >= 1
    import re
    for i in cand_items:
        assert re.match(r"^\d{2}/\d{2}$", i.get("ddmm", "")), i


def test_invalid_ddmm_rejected_by_parser(admin_headers):
    """Server-side: a value like '99/99' should not produce a celebrations entry."""
    # Create another member and submit invalid DOB; backend stores raw string
    # but _parse_day_month returns None so no celebrations entry.
    email = f"TEST_ddmm_bad_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/admin/members",
                      json={"name": "TEST Bad DDMM", "email": email, "role": "member"},
                      headers=admin_headers)
    assert r.status_code in (200, 201)
    data = r.json()
    token = data.get("invite_token")
    mid = data.get("id")
    try:
        acc = requests.post(f"{BASE_URL}/api/auth/accept-invite", json={
            "token": token, "password": "MemberPass@2026",
            "date_of_birth": "99/99", "work_anniversary": "",
        })
        assert acc.status_code == 200
        cel = requests.get(f"{BASE_URL}/api/celebrations", headers=admin_headers).json()
        bad = [i for i in cel if i.get("sub") == email]
        assert bad == [], f"should not have celebration for invalid date: {bad}"
    finally:
        if mid:
            requests.delete(f"{BASE_URL}/api/admin/members/{mid}", headers=admin_headers)
