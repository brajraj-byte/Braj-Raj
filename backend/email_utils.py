import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

logger = logging.getLogger("careerbuddha.email")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Career Buddha")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY not set; skipping email send")
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None


def invite_email_html(name: str, invite_url: str) -> str:
    safe_name = escape(name or "there")
    safe_url = escape(invite_url)
    return (
        '<table role="presentation" width="100%" style="background:#f8fafc;padding:24px">'
        '<tr><td align="center">'
        '<table role="presentation" width="520" style="background:#ffffff;border:1px solid #e2e8f0;'
        'border-radius:14px;font-family:Arial,Helvetica,sans-serif">'
        '<tr><td style="padding:28px 32px">'
        '<p style="font-size:20px;font-weight:800;color:#ea580c;margin:0 0 4px">Career Buddha</p>'
        '<p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#f97316;margin:0 0 20px">Powerful Intervention</p>'
        f'<p style="font-size:15px;color:#0f172a;margin:0 0 12px">Hi {safe_name},</p>'
        '<p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 20px">'
        'You have been invited to join the Career Buddha recruitment console. '
        'Click the button below to set your password and activate your account.</p>'
        f'<a href="{safe_url}" style="display:inline-block;background:#ea580c;color:#ffffff;'
        'text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px">'
        'Activate my account</a>'
        '<p style="font-size:12px;color:#64748b;line-height:1.6;margin:20px 0 0">'
        'If the button does not work, copy this link into your browser:<br>'
        f'<span style="color:#ea580c">{safe_url}</span></p>'
        '<p style="font-size:11px;color:#94a3b8;margin:24px 0 0">Sent by Career Buddha. '
        'We never ask for your password or payment details by email.</p>'
        '</td></tr></table></td></tr></table>'
    )
