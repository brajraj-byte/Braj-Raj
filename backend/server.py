from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Query, Header
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

from auth_utils import (
    hash_password, verify_password, create_access_token,
    get_current_user_factory, decode_token,
)
import storage_utils
from storage_utils import put_object, get_object, APP_NAME, MIME_TYPES
import parsing
import httpx
from email_utils import send_email, invite_email_html

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("careerbuddha")

ONLINE_WINDOW = 120  # seconds
get_current_user = None  # set on startup
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")
OWNER_GOOGLE_EMAIL = os.environ.get("OWNER_GOOGLE_EMAIL", "").lower().strip()


async def current_user(request: Request) -> dict:
    return await get_current_user(request)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class LoginReq(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordReq(BaseModel):
    current_password: Optional[str] = None
    new_password: str


class MemberCreateReq(BaseModel):
    name: str
    email: EmailStr


class AcceptInviteReq(BaseModel):
    token: str
    password: str
    name: Optional[str] = None
    date_of_birth: Optional[str] = None
    work_anniversary: Optional[str] = None
    mobile: Optional[str] = None


class ClientReq(BaseModel):
    organisation_name: str
    hr_person: Optional[str] = ""
    hr_email: Optional[str] = ""
    hr_mobile: Optional[str] = ""
    address: Optional[str] = ""


class BDReq(BaseModel):
    company: str
    source_type: Optional[str] = "manual"  # manual | email | linkedin
    source_value: Optional[str] = ""
    hr_contact: Optional[str] = ""
    hr_email: Optional[str] = ""
    hr_mobile: Optional[str] = ""
    vacancy: Optional[str] = ""
    location: Optional[str] = ""
    status: Optional[str] = "new"  # new | contacted | followup | closed
    next_followup: Optional[str] = ""
    notes: Optional[str] = ""


class BDSuggestReq(BaseModel):
    company: str
    linkedin_url: Optional[str] = ""
    email: Optional[str] = ""


class JoiningReq(BaseModel):
    candidate_name: str
    client_name: Optional[str] = ""
    designation: Optional[str] = ""
    offered_ctc: Optional[str] = ""
    joining_date: Optional[str] = ""
    status: Optional[str] = "offered"  # offered | joined | dropped
    notes: Optional[str] = ""


# ---------- Helpers ----------
def is_online(last_seen):
    if not last_seen:
        return False
    try:
        ls = datetime.fromisoformat(last_seen)
        return (datetime.now(timezone.utc) - ls).total_seconds() < ONLINE_WINDOW
    except Exception:
        return False


def member_public(u, backend_url):
    return {
        "id": str(u["_id"]),
        "name": u.get("name"),
        "email": u.get("email"),
        "role": u.get("role"),
        "status": u.get("status", "invited"),
        "online": is_online(u.get("last_seen")),
        "last_seen": u.get("last_seen"),
        "created_at": u.get("created_at"),
        "mobile": u.get("mobile", ""),
        "date_of_birth": u.get("date_of_birth", ""),
        "work_anniversary": u.get("work_anniversary", ""),
        "invite_token": u.get("invite_token") if u.get("status") == "invited" else None,
    }


def require_admin(user):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


# ---------- Auth ----------
@api.post("/auth/login")
async def login(req: LoginReq):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") == "invited":
        raise HTTPException(status_code=401, detail="Please activate your account via your invite link first")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen": now_iso()}})
    token = create_access_token(str(user["_id"]), email, user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]), "name": user.get("name"), "email": email,
            "role": user["role"], "must_change_password": user.get("must_change_password", False),
        },
    }


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {
        "id": user["id"], "name": user.get("name"), "email": user.get("email"),
        "role": user.get("role"), "must_change_password": user.get("must_change_password", False),
        "date_of_birth": user.get("date_of_birth", ""), "work_anniversary": user.get("work_anniversary", ""),
        "mobile": user.get("mobile", ""),
    }


@api.post("/auth/change-password")
async def change_password(req: ChangePasswordReq, user: dict = Depends(current_user)):
    full = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not user.get("must_change_password"):
        if not req.current_password or not verify_password(req.current_password, full["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"password_hash": hash_password(req.new_password), "must_change_password": False}},
    )
    return {"success": True}


@api.get("/auth/invite/{token}")
async def get_invite(token: str):
    user = await db.users.find_one({"invite_token": token, "status": "invited"})
    if not user:
        raise HTTPException(status_code=404, detail="Invite link is invalid or already used")
    return {"name": user.get("name"), "email": user.get("email")}


@api.post("/auth/accept-invite")
async def accept_invite(req: AcceptInviteReq):
    user = await db.users.find_one({"invite_token": req.token, "status": "invited"})
    if not user:
        raise HTTPException(status_code=404, detail="Invite link is invalid or already used")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    update = {
        "password_hash": hash_password(req.password),
        "status": "active",
        "invite_token": None,
        "must_change_password": False,
        "last_seen": now_iso(),
        "date_of_birth": req.date_of_birth or "",
        "work_anniversary": req.work_anniversary or "",
        "mobile": req.mobile or "",
    }
    if req.name:
        update["name"] = req.name
    await db.users.update_one({"_id": user["_id"]}, {"$set": update})
    token = create_access_token(str(user["_id"]), user["email"], user["role"])
    return {"token": token, "user": {"id": str(user["_id"]), "name": update.get("name", user.get("name")),
                                     "email": user["email"], "role": user["role"], "must_change_password": False}}


@api.post("/auth/google/session")
async def google_session(payload: dict):
    sid = payload.get("session_id")
    if not sid:
        raise HTTPException(status_code=400, detail="Missing session id")
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": sid},
            )
        r.raise_for_status()
        data = r.json()
    except Exception:
        raise HTTPException(status_code=401, detail="Could not verify Google sign-in")
    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or email.split("@")[0]
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")
    user = await db.users.find_one({"email": email})
    if not user:
        if email == OWNER_GOOGLE_EMAIL:
            res = await db.users.insert_one({
                "name": name, "email": email, "role": "admin", "status": "active",
                "password_hash": None, "must_change_password": False,
                "created_at": now_iso(), "last_seen": now_iso(),
                "date_of_birth": "", "work_anniversary": "", "mobile": "",
            })
            user = await db.users.find_one({"_id": res.inserted_id})
        else:
            raise HTTPException(status_code=403, detail="This Google account is not authorized. Please ask your admin for an invite.")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_seen": now_iso(), "status": "active", "invite_token": None}},
    )
    token = create_access_token(str(user["_id"]), email, user["role"])
    return {"token": token, "user": {"id": str(user["_id"]), "name": user.get("name"), "email": email,
                                     "role": user["role"], "must_change_password": user.get("must_change_password", False)}}


@api.post("/heartbeat")
async def heartbeat(user: dict = Depends(current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"last_seen": now_iso()}})
    return {"ok": True}


# ---------- Admin ----------
@api.get("/admin/members")
async def list_members(request: Request, user: dict = Depends(current_user)):
    require_admin(user)
    backend_url = str(request.base_url)
    members = await db.users.find({"role": "member"}).sort("created_at", -1).to_list(500)
    return [member_public(m, backend_url) for m in members]


@api.post("/admin/members")
async def create_member(req: MemberCreateReq, user: dict = Depends(current_user)):
    require_admin(user)
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    token = secrets.token_urlsafe(24)
    doc = {
        "name": req.name, "email": email, "role": "member", "status": "invited",
        "invite_token": token, "password_hash": None, "must_change_password": False,
        "created_at": now_iso(), "last_seen": None,
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    invite_url = f"{FRONTEND_URL}/invite/{token}"
    await send_email(to=email, subject="You're invited to Career Buddha",
                     html=invite_email_html(req.name, invite_url))
    return member_public(doc, "")


@api.delete("/admin/members/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(current_user)):
    require_admin(user)
    res = await db.users.delete_one({"_id": ObjectId(member_id), "role": "member"})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"success": True}


@api.post("/admin/members/{member_id}/regenerate-invite")
async def regenerate_invite(member_id: str, user: dict = Depends(current_user)):
    require_admin(user)
    token = secrets.token_urlsafe(24)
    m = await db.users.find_one({"_id": ObjectId(member_id), "role": "member"})
    await db.users.update_one(
        {"_id": ObjectId(member_id), "role": "member"},
        {"$set": {"invite_token": token, "status": "invited", "password_hash": None}},
    )
    if m:
        invite_url = f"{FRONTEND_URL}/invite/{token}"
        await send_email(to=m["email"], subject="Your new Career Buddha invite link",
                         html=invite_email_html(m.get("name"), invite_url))
    return {"invite_token": token}


FEATURE_DEFAULTS = {
    "parse_resume": True, "candidate_db": True, "client_details": True,
    "business_development": True, "joining_details": True, "advanced_search": True,
    "celebrations": True, "ai_bd_suggestions": True,
}


@api.get("/features")
async def get_features(user: dict = Depends(current_user)):
    doc = await db.settings.find_one({"key": "features"})
    feats = dict(FEATURE_DEFAULTS)
    if doc:
        feats.update({k: v for k, v in doc.items() if k in FEATURE_DEFAULTS})
    return feats


@api.put("/features")
async def update_features(payload: dict, user: dict = Depends(current_user)):
    require_admin(user)
    update = {k: bool(v) for k, v in payload.items() if k in FEATURE_DEFAULTS}
    await db.settings.update_one({"key": "features"}, {"$set": update}, upsert=True)
    doc = await db.settings.find_one({"key": "features"})
    feats = dict(FEATURE_DEFAULTS)
    feats.update({k: v for k, v in doc.items() if k in FEATURE_DEFAULTS})
    return feats


# ---------- Resume parsing & candidate DB ----------
@api.post("/resumes/parse")
async def parse_resume_endpoint(file: UploadFile = File(...), user: dict = Depends(current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ("pdf", "docx", "doc"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX resumes are supported")
    data = await file.read()

    resume_path = f"{APP_NAME}/resumes/{user['id']}/{uuid.uuid4()}.{ext}"
    put_object(resume_path, data, MIME_TYPES.get(ext, "application/octet-stream"))

    fields = await parsing.parse_resume(data, ext)

    photo_path = None
    try:
        img_bytes, img_ext = parsing.extract_photo(data, ext)
        if img_bytes:
            img_ext = (img_ext or "png").lower()
            photo_path = f"{APP_NAME}/photos/{user['id']}/{uuid.uuid4()}.{img_ext}"
            put_object(photo_path, img_bytes, MIME_TYPES.get(img_ext, "image/png"))
    except Exception as e:
        logger.warning(f"photo extract failed: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        **fields,
        "resume_path": resume_path,
        "resume_filename": file.filename,
        "photo_path": photo_path,
        "parsed_by_id": user["id"],
        "parsed_by_name": user.get("name"),
        "date_of_parsing": now_iso(),
        "is_deleted": False,
    }
    await db.candidates.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def _candidate_out(c):
    c = dict(c)
    c.pop("_id", None)
    c.pop("is_deleted", None)
    return c


@api.get("/resumes")
async def list_resumes(
    q: Optional[str] = None, name: Optional[str] = None, email: Optional[str] = None,
    mobile: Optional[str] = None, city: Optional[str] = None, industry: Optional[str] = None,
    present_company: Optional[str] = None, designation: Optional[str] = None,
    preferred_location: Optional[str] = None, qualification: Optional[str] = None,
    skill: Optional[str] = None, notice_period: Optional[str] = None,
    user: dict = Depends(current_user),
):
    query = {"is_deleted": {"$ne": True}}
    rx = lambda v: {"$regex": v, "$options": "i"}
    if name: query["name"] = rx(name)
    if email: query["email"] = rx(email)
    if mobile: query["mobile_number"] = rx(mobile)
    if city: query["city"] = rx(city)
    if industry: query["industry"] = rx(industry)
    if present_company: query["present_company"] = rx(present_company)
    if designation: query["designation"] = rx(designation)
    if preferred_location: query["preferred_location"] = rx(preferred_location)
    if qualification: query["highest_qualification"] = rx(qualification)
    if notice_period: query["notice_period"] = rx(notice_period)
    if skill: query["skill_sets"] = rx(skill)
    if q:
        query["$or"] = [
            {"name": rx(q)}, {"email": rx(q)}, {"mobile_number": rx(q)},
            {"present_company": rx(q)}, {"designation": rx(q)}, {"city": rx(q)},
            {"skill_sets": rx(q)}, {"industry": rx(q)},
        ]
    docs = await db.candidates.find(query).sort("date_of_parsing", -1).to_list(1000)
    return [_candidate_out(c) for c in docs]


@api.get("/resumes/{cid}")
async def get_resume(cid: str, user: dict = Depends(current_user)):
    doc = await db.candidates.find_one({"id": cid, "is_deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _candidate_out(doc)


@api.delete("/resumes/{cid}")
async def delete_resume(cid: str, user: dict = Depends(current_user)):
    await db.candidates.update_one({"id": cid}, {"$set": {"is_deleted": True}})
    return {"success": True}


@api.get("/files")
async def download_file(path: str = Query(...), auth: Optional[str] = Query(None),
                        authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    filename = path.rsplit("/", 1)[-1]
    is_img = ctype.startswith("image/")
    headers = {} if is_img else {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=data, media_type=ctype, headers=headers)


# ---------- Clients ----------
@api.get("/clients")
async def list_clients(user: dict = Depends(current_user)):
    docs = await db.clients.find({"is_deleted": {"$ne": True}}).sort("created_at", -1).to_list(1000)
    return [{**{k: v for k, v in d.items() if k != "_id" and k != "is_deleted"}} for d in docs]


@api.post("/clients")
async def create_client(req: ClientReq, user: dict = Depends(current_user)):
    doc = {"id": str(uuid.uuid4()), **req.model_dump(), "created_by": user.get("name"),
           "created_at": now_iso(), "is_deleted": False}
    await db.clients.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    return doc


@api.put("/clients/{cid}")
async def update_client(cid: str, req: ClientReq, user: dict = Depends(current_user)):
    await db.clients.update_one({"id": cid}, {"$set": req.model_dump()})
    return {"success": True}


@api.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(current_user)):
    await db.clients.update_one({"id": cid}, {"$set": {"is_deleted": True}})
    return {"success": True}


# ---------- Business Development ----------
@api.get("/bd")
async def list_bd(user: dict = Depends(current_user)):
    docs = await db.bd_leads.find({"is_deleted": {"$ne": True}}).sort("created_at", -1).to_list(1000)
    return [{k: v for k, v in d.items() if k not in ("_id", "is_deleted")} for d in docs]


@api.post("/bd")
async def create_bd(req: BDReq, user: dict = Depends(current_user)):
    doc = {"id": str(uuid.uuid4()), **req.model_dump(), "created_by": user.get("name"),
           "created_by_id": user["id"], "created_at": now_iso(), "is_deleted": False}
    await db.bd_leads.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    return doc


@api.put("/bd/{bid}")
async def update_bd(bid: str, req: BDReq, user: dict = Depends(current_user)):
    await db.bd_leads.update_one({"id": bid}, {"$set": req.model_dump()})
    return {"success": True}


@api.delete("/bd/{bid}")
async def delete_bd(bid: str, user: dict = Depends(current_user)):
    await db.bd_leads.update_one({"id": bid}, {"$set": {"is_deleted": True}})
    return {"success": True}


@api.post("/bd/suggest")
async def bd_suggest(req: BDSuggestReq, user: dict = Depends(current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json
    feats = await db.settings.find_one({"key": "features"})
    if feats and feats.get("ai_bd_suggestions") is False:
        raise HTTPException(status_code=403, detail="AI suggestions are disabled by admin")
    ctx = f"Company: {req.company}."
    if req.linkedin_url:
        ctx += f" LinkedIn: {req.linkedin_url}."
    if req.email:
        ctx += f" Known email/domain: {req.email}."
    prompt = (
        "You are a B2B recruitment business-development assistant. Based on the company below, suggest "
        "3 likely SENIOR HR / Talent Acquisition roles to target for hiring mandates. These are ROLE-BASED "
        "suggestions (typical titles and outreach tips), NOT real personal data. "
        'Respond ONLY as JSON: {"suggestions":[{"title":"","likely_email_pattern":"","outreach_tip":""}],"note":""}. '
        + ctx
    )
    chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"), session_id="bd-suggest",
                   system_message="You are a helpful recruitment BD assistant. Respond only with valid JSON.").with_model("gemini", "gemini-2.5-flash")
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        raw = raw.strip().strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        s, e = raw.find("{"), raw.rfind("}")
        data = _json.loads(raw[s:e + 1])
    except Exception as ex:
        logger.warning(f"bd suggest failed: {ex}")
        data = {"suggestions": [], "note": "Could not generate suggestions right now."}
    return data


# ---------- Joining details ----------
@api.get("/joinings")
async def list_joinings(user: dict = Depends(current_user)):
    query = {"is_deleted": {"$ne": True}}
    if user.get("role") != "admin":
        query["created_by_id"] = user["id"]
    docs = await db.joinings.find(query).sort("created_at", -1).to_list(1000)
    return [{k: v for k, v in d.items() if k not in ("_id", "is_deleted")} for d in docs]


@api.post("/joinings")
async def create_joining(req: JoiningReq, user: dict = Depends(current_user)):
    doc = {"id": str(uuid.uuid4()), **req.model_dump(), "created_by": user.get("name"),
           "created_by_id": user["id"], "created_at": now_iso(), "is_deleted": False}
    await db.joinings.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    return doc


@api.put("/joinings/{jid}")
async def update_joining(jid: str, req: JoiningReq, user: dict = Depends(current_user)):
    query = {"id": jid}
    if user.get("role") != "admin":
        query["created_by_id"] = user["id"]
    await db.joinings.update_one(query, {"$set": req.model_dump()})
    return {"success": True}


@api.delete("/joinings/{jid}")
async def delete_joining(jid: str, user: dict = Depends(current_user)):
    query = {"id": jid}
    if user.get("role") != "admin":
        query["created_by_id"] = user["id"]
    await db.joinings.update_one(query, {"$set": {"is_deleted": True}})
    return {"success": True}


# ---------- Celebrations ----------
def _parse_day_month(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%m", "%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return (dt.month, dt.day)
        except Exception:
            continue
    return None


def _days_until(month, day):
    today = datetime.now(timezone.utc).date()
    for yr in (today.year, today.year + 1):
        try:
            d = datetime(yr, month, day).date()
        except ValueError:
            d = datetime(yr, month, 28).date()
        if d >= today:
            return (d - today).days, d.isoformat()
    return 999, ""


@api.get("/celebrations")
async def celebrations(user: dict = Depends(current_user)):
    items = []
    members = await db.users.find({"role": {"$in": ["member", "admin"]}}).to_list(500)
    for m in members:
        dm = _parse_day_month(m.get("date_of_birth"))
        if dm:
            days, date = _days_until(*dm)
            items.append({"type": "Birthday", "who": "Team Member", "name": m.get("name"),
                          "sub": m.get("email"), "days_until": days, "date": date, "present_company": "Career Buddha"})
        dm = _parse_day_month(m.get("work_anniversary"))
        if dm:
            days, date = _days_until(*dm)
            items.append({"type": "Work Anniversary", "who": "Team Member", "name": m.get("name"),
                          "sub": m.get("email"), "days_until": days, "date": date, "present_company": "Career Buddha"})
    cands = await db.candidates.find({"is_deleted": {"$ne": True}}).to_list(2000)
    for c in cands:
        dm = _parse_day_month(c.get("date_of_birth"))
        if dm:
            days, date = _days_until(*dm)
            items.append({"type": "Birthday", "who": "Candidate", "name": c.get("name"),
                          "sub": c.get("designation"), "days_until": days, "date": date,
                          "present_company": c.get("present_company")})
    items.sort(key=lambda x: x["days_until"])
    return items


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    global get_current_user
    get_current_user = await get_current_user_factory(db)
    await db.users.create_index("email", unique=True)
    await db.candidates.create_index("id")
    # seed admin
    admin_email = os.environ["ADMIN_EMAIL"].lower().strip()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "name": "Braj Raj", "email": admin_email, "role": "admin", "status": "active",
            "password_hash": hash_password(admin_pw), "must_change_password": True,
            "created_at": now_iso(), "last_seen": None, "date_of_birth": "", "work_anniversary": "",
        })
        logger.info("Seeded admin account")
    await db.settings.update_one({"key": "features"}, {"$setOnInsert": {"key": "features", **FEATURE_DEFAULTS}}, upsert=True)
    try:
        storage_utils.init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
