import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-powerhouse.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "braj.raj@careerbuddha.in")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "CareerBuddha@2026")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    # Try login; if must_change_password, change to same password to clear flag
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}: {r.text}")
    data = r.json()
    token = data["token"]
    if data["user"].get("must_change_password"):
        rc = requests.post(f"{BASE_URL}/api/auth/change-password",
                           headers={"Authorization": f"Bearer {token}",
                                    "Content-Type": "application/json"},
                           json={"new_password": ADMIN_PASSWORD})
        assert rc.status_code == 200, rc.text
        # re-login
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        token = r.json()["token"]
    return token


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="session")
def sample_pdf_bytes():
    try:
        from reportlab.pdfgen import canvas
    except ImportError:
        pytest.skip("reportlab not installed")
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    y = 800
    lines = [
        "John Doe TEST Candidate",
        "Email: john.testcb@example.com",
        "Mobile: +91-9876543210",
        "City: Bengaluru",
        "Date of Birth: 1990-05-15",
        "Highest Qualification: B.Tech Computer Science",
        "Present Company: Acme Corp",
        "Designation: Senior Software Engineer",
        "Industry: IT Services",
        "Skills: Python, FastAPI, React, MongoDB, AWS",
        "Preferred Location: Bengaluru, Hyderabad",
        "Notice Period: 60 days",
        "Experience: 8 years software development, team leadership",
        "Previous: Beta Inc, Alpha Ltd",
    ]
    for line in lines:
        c.drawString(50, y, line)
        y -= 20
    c.showPage()
    c.save()
    return buf.getvalue()
