"""Tests for Team Messenger (/api/chat/*) and In-app Mailer (/api/mail/*)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")


# ---------- Chat ----------
class TestChatPresence:
    def test_presence_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/chat/presence")
        assert r.status_code in (401, 403)

    def test_presence_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/chat/presence")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        for u in data:
            assert "id" in u and "name" in u and "state" in u and "self" in u
            assert u["state"] in ("online", "away", "dormant", "offline")
        # exactly one self entry
        selves = [u for u in data if u["self"]]
        assert len(selves) == 1


CHAT_IDS = []


class TestChatMessages:
    def test_empty_text_rejected(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/chat/messages", json={"text": "   "})
        assert r.status_code == 400

    def test_send_and_fetch(self, admin_client):
        text = f"TEST_CHAT_{uuid.uuid4().hex[:8]} hello team"
        r = admin_client.post(f"{BASE_URL}/api/chat/messages", json={"text": text})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["text"] == text
        assert doc["sender_name"]
        assert doc["id"]
        CHAT_IDS.append(doc["id"])

        r2 = admin_client.get(f"{BASE_URL}/api/chat/messages")
        assert r2.status_code == 200
        msgs = r2.json()
        assert any(m["id"] == doc["id"] and m["text"] == text for m in msgs)
        # ascending order check (created_at non-decreasing)
        times = [m.get("created_at") for m in msgs if m.get("created_at")]
        assert times == sorted(times)

    def test_presence_updated_after_send(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/chat/presence")
        me = [u for u in r.json() if u["self"]][0]
        assert me["state"] == "online"


# ---------- Mail ----------
MAIL_IDS = []


class TestMailer:
    def test_empty_body_rejected(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/mail/send",
                              json={"to": "demo@example.com", "subject": "s", "body": "   "})
        assert r.status_code == 400

    def test_invalid_email_rejected(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/mail/send",
                              json={"to": "not-an-email", "subject": "s", "body": "hi"})
        assert r.status_code == 422

    def test_send_valid(self, admin_client):
        subj = f"TEST_MAIL_{uuid.uuid4().hex[:8]}"
        r = admin_client.post(f"{BASE_URL}/api/mail/send",
                              json={"to": "deliverability-test@resend.dev",
                                    "subject": subj, "body": "Hello from pytest"})
        # Resend accepted => 200 sent. If sandbox refuses treat as failure (502) - log and skip
        if r.status_code == 502:
            pytest.skip(f"Resend returned failure: {r.text}")
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "sent"
        assert doc["subject"] == subj
        assert doc["id"]
        MAIL_IDS.append(doc["id"])

    def test_sent_list_contains(self, admin_client):
        if not MAIL_IDS:
            pytest.skip("no mail sent")
        r = admin_client.get(f"{BASE_URL}/api/mail/sent")
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert MAIL_IDS[0] in ids

    def test_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/mail/send",
                     json={"to": "x@y.com", "body": "x"})
        assert r.status_code in (401, 403)


# ---------- Features regression ----------
class TestFeaturesIncludesMailer:
    def test_mailer_toggle_present(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/features")
        assert r.status_code == 200
        feats = r.json()
        assert "mailer" in feats, f"missing 'mailer' key in features: {list(feats.keys())}"


# ---------- Cleanup ----------
def test_zz_cleanup():
    # Best-effort cleanup via Mongo (requires python-dotenv + motor). We skip if cannot connect.
    try:
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        mc = MongoClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        if CHAT_IDS:
            db.messages.delete_many({"id": {"$in": CHAT_IDS}})
        if MAIL_IDS:
            db.mail_log.delete_many({"id": {"$in": MAIL_IDS}})
        # Also delete any lingering TEST_CHAT_ messages / TEST_MAIL_ subject logs
        db.messages.delete_many({"text": {"$regex": "^TEST_CHAT_"}})
        db.mail_log.delete_many({"subject": {"$regex": "^TEST_MAIL_"}})
    except Exception as e:
        print(f"cleanup skipped: {e}")
