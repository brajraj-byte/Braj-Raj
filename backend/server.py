from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import io
import zipfile
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Query, Header, BackgroundTasks
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
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")


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


class JobTrackReq(BaseModel):
    date: Optional[str] = ""
    candidate_name: str
    age: Optional[str] = ""
    email: Optional[str] = ""
    total_experience: Optional[str] = ""
    organisation: Optional[str] = ""
    job_title: Optional[str] = ""
    present_location: Optional[str] = ""
    present_ctc: Optional[str] = ""
    notice_period: Optional[str] = ""


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
        "last_login": u.get("last_login"),
        "last_logout": u.get("last_logout"),
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
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_seen": now_iso(), "last_login": now_iso()}})
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
        "last_login": now_iso(),
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
        {"$set": {"last_seen": now_iso(), "last_login": now_iso(), "status": "active", "invite_token": None}},
    )
    token = create_access_token(str(user["_id"]), email, user["role"])
    return {"token": token, "user": {"id": str(user["_id"]), "name": user.get("name"), "email": email,
                                     "role": user["role"], "must_change_password": user.get("must_change_password", False)}}


@api.post("/heartbeat")
async def heartbeat(user: dict = Depends(current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"last_seen": now_iso()}})
    return {"ok": True}


@api.post("/auth/logout")
async def logout_endpoint(user: dict = Depends(current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"last_logout": now_iso()}})
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
    "celebrations": True, "ai_bd_suggestions": True, "job_tracking": True,
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
ALLOWED_RESUME_EXT = ("pdf", "docx", "doc", "txt", "html", "htm")


def _norm_mobile(m):
    digits = re.sub(r"\D", "", m or "")
    return digits[-10:] if len(digits) >= 10 else digits


async def _find_duplicate(email, mobile):
    ors = []
    if email:
        ors.append({"email": {"$regex": f"^{re.escape(email.strip())}$", "$options": "i"}})
    mn = _norm_mobile(mobile)
    if mn:
        ors.append({"mobile_norm": mn})
    if not ors:
        return None
    return await db.candidates.find_one({"is_deleted": {"$ne": True}, "$or": ors})


async def _parse_and_store(data: bytes, ext: str, filename: str, user_id: str, user_name: str) -> dict:
    resume_path = f"{APP_NAME}/resumes/{user_id}/{uuid.uuid4()}.{ext}"
    put_object(resume_path, data, MIME_TYPES.get(ext, "application/octet-stream"))
    fields = await parsing.parse_resume(data, ext)
    photo_path = None
    try:
        img_bytes, img_ext = parsing.extract_photo(data, ext)
        if img_bytes:
            img_ext = (img_ext or "png").lower()
            photo_path = f"{APP_NAME}/photos/{user_id}/{uuid.uuid4()}.{img_ext}"
            put_object(photo_path, img_bytes, MIME_TYPES.get(img_ext, "image/png"))
    except Exception as e:
        logger.warning(f"photo extract failed: {e}")
    mobile_norm = _norm_mobile(fields.get("mobile_number"))
    dup = await _find_duplicate(fields.get("email"), fields.get("mobile_number"))
    doc = {
        "id": str(uuid.uuid4()), **fields, "mobile_norm": mobile_norm,
        "is_duplicate": bool(dup), "duplicate_of": dup["id"] if dup else None,
        "duplicate_name": dup.get("name") if dup else None,
        "resume_path": resume_path, "resume_filename": filename,
        "photo_path": photo_path, "parsed_by_id": user_id, "parsed_by_name": user_name,
        "date_of_parsing": now_iso(), "is_deleted": False,
    }
    await db.candidates.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.post("/resumes/parse")
async def parse_resume_endpoint(file: UploadFile = File(...), user: dict = Depends(current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_RESUME_EXT:
        raise HTTPException(status_code=400, detail="Supported formats: PDF, DOC, DOCX, TXT, HTML")
    data = await file.read()
    return await _parse_and_store(data, ext, file.filename, user["id"], user.get("name"))


async def _process_bulk(job_id: str, user_id: str, user_name: str, items: list):
    for it in items:
        ext, filename = it["ext"], it["filename"]
        try:
            if ext not in ALLOWED_RESUME_EXT:
                res = {"filename": filename, "status": "error", "error": "Unsupported format"}
            else:
                doc = await _parse_and_store(it["data"], ext, filename, user_id, user_name)
                res = {"filename": filename, "status": "done", "name": doc.get("name") or "Unknown",
                       "id": doc["id"], "duplicate": bool(doc.get("is_duplicate")),
                       "duplicate_name": doc.get("duplicate_name")}
        except Exception as ex:
            logger.warning(f"bulk parse {filename} failed: {ex}")
            res = {"filename": filename, "status": "error", "error": "Parse failed"}
        await db.parse_jobs.update_one({"id": job_id}, {"$push": {"results": res}, "$inc": {"done": 1}})
    await db.parse_jobs.update_one({"id": job_id}, {"$set": {"status": "completed"}})


@api.post("/resumes/parse-bulk")
async def parse_bulk(background: BackgroundTasks, files: List[UploadFile] = File(...),
                     user: dict = Depends(current_user)):
    items = []
    for f in files:
        ext = (f.filename.rsplit(".", 1)[-1] if "." in f.filename else "bin").lower()
        data = await f.read()
        if ext == "zip":
            try:
                zf = zipfile.ZipFile(io.BytesIO(data))
                for n in zf.namelist():
                    if n.endswith("/") or "__MACOSX" in n:
                        continue
                    sub = (n.rsplit(".", 1)[-1].lower() if "." in n else "")
                    if sub in ALLOWED_RESUME_EXT:
                        items.append({"filename": n.rsplit("/", 1)[-1], "ext": sub, "data": zf.read(n)})
            except Exception as ex:
                logger.warning(f"zip extract failed: {ex}")
        else:
            items.append({"filename": f.filename, "ext": ext, "data": data})
    if not items:
        raise HTTPException(status_code=400, detail="No files provided")
    job_id = str(uuid.uuid4())
    await db.parse_jobs.insert_one({
        "id": job_id, "user_id": user["id"], "total": len(items), "done": 0,
        "status": "processing", "results": [], "created_at": now_iso(),
    })
    background.add_task(_process_bulk, job_id, user["id"], user.get("name"), items)
    return {"job_id": job_id, "total": len(items)}


@api.get("/resumes/bulk/{job_id}")
async def bulk_status(job_id: str, user: dict = Depends(current_user)):
    job = await db.parse_jobs.find_one({"id": job_id, "user_id": user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.pop("_id", None)
    return job


def _candidate_out(c):
    c = dict(c)
    c.pop("_id", None)
    c.pop("is_deleted", None)
    c.pop("mobile_norm", None)
    return c


@api.get("/resumes")
async def list_resumes(
    q: Optional[str] = None, name: Optional[str] = None, email: Optional[str] = None,
    mobile: Optional[str] = None, city: Optional[str] = None, industry: Optional[str] = None,
    present_company: Optional[str] = None, designation: Optional[str] = None,
    preferred_location: Optional[str] = None, qualification: Optional[str] = None,
    skill: Optional[str] = None, notice_period: Optional[str] = None,
    experience: Optional[str] = None,
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
    if experience: query["total_experience"] = rx(experience)
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
    require_admin(user)
    res = await db.candidates.update_one({"id": cid, "is_deleted": {"$ne": True}}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"success": True}


@api.get("/files")
async def download_file(path: str = Query(...), auth: Optional[str] = Query(None),
                        name: Optional[str] = Query(None),
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
    data, ctype = None, None
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    is_img = ctype.startswith("image/")
    if is_img:
        headers = {}
    else:
        dl = (name or path.rsplit("/", 1)[-1]).replace('"', "").replace("\n", " ").replace("\r", " ").strip()
        headers = {"Content-Disposition": f'attachment; filename="{dl}"'}
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


# ---------- Daily HR leads (LinkedIn / Google sourced) ----------
import urllib.parse as _urlparse


def _search_urls(company, title, hr_name):
    q = _urlparse.quote_plus
    people = f"{title} {company}".strip()
    return {
        "linkedin_search_url": f"https://www.linkedin.com/search/results/people/?keywords={q(people)}",
        "google_search_url": f"https://www.google.com/search?q={q(f'{title} {company} HR email')}",
        "mobile_search_url": f"https://www.google.com/search?q={q((hr_name or title) + ' ' + company + ' HR contact number')}",
    }


async def _generate_daily_hr_leads(industry: str = "", city: str = ""):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json
    focus = ""
    if industry:
        focus += f" Focus on the {industry} industry."
    if city:
        focus += f" Prefer companies with hiring activity in or around {city}."
    prompt = (
        "You are a recruitment lead-generation researcher for an Indian recruitment agency. "
        "Suggest 3 DIFFERENT real MID-SIZED or SME (small & medium enterprise) companies BASED IN INDIA "
        "that are commonly hiring. STRICT RULES: do NOT suggest large MNCs, Fortune-500, big IT majors "
        "(e.g. TCS, Infosys, Wipro, Accenture, Amazon, Google) or global giants. Prefer growing Indian "
        "companies with roughly 50-2000 employees across Indian cities. "
        "For each company give a senior HR / Talent Acquisition contact to target. "
        "Return JSON fields per lead: company, domain (primary website domain like example.com), industry, "
        "city (an Indian city), title (senior HR/TA role), hr_name (a plausible contact name to look for - a "
        "suggestion to be verified on LinkedIn, not confirmed data), email_pattern (like 'first.last'), "
        "note (one short outreach tip)."
        + focus +
        ' Respond ONLY as JSON: {"leads":[{...},{...},{...}]}'
    )
    chat = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"), session_id="daily-hr-leads",
                   system_message="You are a recruitment research assistant. Respond only with valid JSON.").with_model("gemini", "gemini-2.5-flash")
    leads = []
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        raw = raw.strip().strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        s, e = raw.find("{"), raw.rfind("}")
        data = _json.loads(raw[s:e + 1])
        for lead in (data.get("leads") or [])[:3]:
            company = (lead.get("company") or "").strip()
            domain = (lead.get("domain") or "").strip().lstrip("@")
            title = (lead.get("title") or "HR / Talent Acquisition").strip()
            hr_name = (lead.get("hr_name") or "").strip()
            pattern = (lead.get("email_pattern") or "first.last").strip()
            likely_email = f"{pattern}@{domain}" if domain and "@" not in pattern else pattern
            leads.append({
                "company": company, "domain": domain, "industry": lead.get("industry") or industry,
                "city": lead.get("city") or city, "title": title, "hr_name": hr_name,
                "likely_email": likely_email, "mobile": "", "note": lead.get("note") or "",
                **_search_urls(company, title, hr_name),
            })
    except Exception as ex:
        logger.warning(f"daily hr leads failed: {ex}")
    return leads


async def _ensure_daily_leads(user_id, industry="", city="", force=False):
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.daily_hr_leads.find_one({"user_id": user_id, "date": today})
    if existing and not force and existing.get("leads"):
        existing.pop("_id", None)
        return existing
    leads = await _generate_daily_hr_leads(industry, city)
    doc = {"user_id": user_id, "date": today, "generated_at": now_iso(),
           "industry": industry, "city": city, "leads": leads}
    await db.daily_hr_leads.update_one({"user_id": user_id, "date": today}, {"$set": doc}, upsert=True)
    return doc


def _daily_out(doc):
    return {"date": doc["date"], "generated_at": doc.get("generated_at"),
            "industry": doc.get("industry", ""), "city": doc.get("city", ""), "leads": doc.get("leads", [])}


@api.get("/bd/daily")
async def get_daily_leads(user: dict = Depends(current_user)):
    full = await db.users.find_one({"_id": ObjectId(user["id"])})
    doc = await _ensure_daily_leads(user["id"], full.get("bd_industry", ""), full.get("bd_city", ""))
    return _daily_out(doc)


@api.post("/bd/daily/refresh")
async def refresh_daily_leads(payload: dict = None, user: dict = Depends(current_user)):
    payload = payload or {}
    industry = (payload.get("industry") or "").strip()
    city = (payload.get("city") or "").strip()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"bd_industry": industry, "bd_city": city}})
    doc = await _ensure_daily_leads(user["id"], industry, city, force=True)
    return _daily_out(doc)


@api.get("/bd/daily/all")
async def all_daily_leads(user: dict = Depends(current_user)):
    require_admin(user)
    docs = await db.daily_hr_leads.find({}).sort([("date", -1), ("generated_at", -1)]).to_list(5000)
    users = {str(u["_id"]): u for u in await db.users.find({}).to_list(2000)}
    out = []
    for d in docs:
        u = users.get(d["user_id"], {})
        out.append({
            "user_id": d["user_id"], "user_name": u.get("name", "Unknown"), "user_email": u.get("email", ""),
            "date": d["date"], "generated_at": d.get("generated_at"),
            "industry": d.get("industry", ""), "city": d.get("city", ""), "leads": d.get("leads", []),
        })
    return out


async def _run_daily_leads_job():
    users = await db.users.find({"status": "active"}).to_list(1000)
    for u in users:
        try:
            await _ensure_daily_leads(str(u["_id"]), u.get("bd_industry", ""), u.get("bd_city", ""), force=True)
        except Exception as ex:
            logger.warning(f"daily leads job for {u.get('email')} failed: {ex}")


@api.post("/cron/daily-hr-leads")
async def cron_daily_hr_leads(background: BackgroundTasks, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not token or not secrets.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    background.add_task(_run_daily_leads_job)
    return {"accepted": True}


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


# ---------- Job Tracking ----------
@api.get("/job-tracking")
async def list_job_tracking(date: Optional[str] = None, user: dict = Depends(current_user)):
    q = {"is_deleted": {"$ne": True}}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    if date:
        q["date"] = date
    docs = await db.job_tracking.find(q).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    return [{k: v for k, v in d.items() if k not in ("_id", "is_deleted")} for d in docs]


@api.post("/job-tracking")
async def create_job_tracking(req: JobTrackReq, user: dict = Depends(current_user)):
    d = req.model_dump()
    if not d.get("date"):
        d["date"] = datetime.now(timezone.utc).date().isoformat()
    doc = {"id": str(uuid.uuid4()), **d, "user_id": user["id"], "user_name": user.get("name"),
           "created_at": now_iso(), "updated_at": now_iso(), "is_deleted": False}
    await db.job_tracking.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    return doc


@api.put("/job-tracking/{tid}")
async def update_job_tracking(tid: str, req: JobTrackReq, user: dict = Depends(current_user)):
    q = {"id": tid}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    d = req.model_dump()
    d["updated_at"] = now_iso()
    res = await db.job_tracking.update_one(q, {"$set": d})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"success": True}


@api.delete("/job-tracking/{tid}")
async def delete_job_tracking(tid: str, user: dict = Depends(current_user)):
    q = {"id": tid}
    if user.get("role") != "admin":
        q["user_id"] = user["id"]
    res = await db.job_tracking.update_one(q, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"success": True}


# ---------- Celebrations ----------
def _parse_day_month(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d/%m", "%m/%d", "%d-%m", "%m-%d"):
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
                          "sub": m.get("email"), "days_until": days, "date": date,
                          "ddmm": f"{dm[1]:02d}/{dm[0]:02d}", "present_company": "Career Buddha 360 Suite"})
        dm = _parse_day_month(m.get("work_anniversary"))
        if dm:
            days, date = _days_until(*dm)
            items.append({"type": "Work Anniversary", "who": "Team Member", "name": m.get("name"),
                          "sub": m.get("email"), "days_until": days, "date": date,
                          "ddmm": f"{dm[1]:02d}/{dm[0]:02d}", "present_company": "Career Buddha 360 Suite"})
    cands = await db.candidates.find({"is_deleted": {"$ne": True}}).to_list(2000)
    for c in cands:
        dm = _parse_day_month(c.get("date_of_birth"))
        if dm:
            days, date = _days_until(*dm)
            items.append({"type": "Birthday", "who": "Candidate", "name": c.get("name"),
                          "sub": c.get("designation"), "days_until": days, "date": date,
                          "ddmm": f"{dm[1]:02d}/{dm[0]:02d}",
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
