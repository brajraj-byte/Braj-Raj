"""Regression test for owner email config change to braj.raj@careerbuddha.in."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")
OWNER_EMAIL = "braj.raj@careerbuddha.in"
OWNER_PASSWORD = "CareerBuddha@2026"
OLD_GMAIL = "brajraj.2505@gmail.com"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("role") == "admin" or data.get("user", {}).get("role") == "admin", data
    return data["token"] if "token" in data else data["access_token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_admin_role():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=20)
    assert r.status_code == 200
    j = r.json()
    role = j.get("role") or j.get("user", {}).get("role")
    assert role == "admin"
    email = j.get("email") or j.get("user", {}).get("email")
    assert email == OWNER_EMAIL


def test_auth_me_returns_owner_admin(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    me = r.json()
    assert me.get("email") == OWNER_EMAIL
    assert me.get("role") == "admin"


def test_old_gmail_login_rejected():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": OLD_GMAIL, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code in (400, 401, 403, 404), f"old gmail should not log in: {r.status_code} {r.text}"


def test_no_old_gmail_in_members(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/members", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    members = r.json()
    assert isinstance(members, list)
    emails = [m.get("email", "").lower() for m in members]
    assert OLD_GMAIL not in emails, f"old gmail still present: {emails}"
    # /api/admin/members returns team members only (not admin itself). Admin
    # identity is verified via /api/auth/me (see test_auth_me_returns_owner_admin).
    admin_rows = [m for m in members if m.get("role") == "admin"]
    for a in admin_rows:
        assert a.get("email") != OLD_GMAIL


def test_db_has_no_old_gmail_account():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    # Check common user collections
    found = False
    for coll_name in db.list_collection_names():
        if any(k in coll_name.lower() for k in ("user", "member", "admin")):
            c = db[coll_name].count_documents({"email": {"$regex": "brajraj.2505", "$options": "i"}})
            if c > 0:
                found = True
                print(f"found {c} in {coll_name}")
    assert not found, "brajraj.2505@gmail.com still exists in DB"


def test_features_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/features", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))


def test_admin_members_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/members", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_celebrations_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/celebrations", headers=auth_headers, timeout=15)
    assert r.status_code == 200


def test_chat_presence_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/chat/presence", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # The current user should be present as self=true
    selves = [x for x in data if x.get("self")]
    assert len(selves) == 1
    assert selves[0].get("name") or selves[0].get("email") == OWNER_EMAIL


def test_mail_sent_endpoint(auth_headers):
    r = requests.get(f"{BASE_URL}/api/mail/sent", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
