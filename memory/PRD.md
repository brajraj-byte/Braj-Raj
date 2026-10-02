# Career Buddha — Powerful Intervention (PRD)

## Original Problem Statement
Recruitment Tracking System for a recruitment agency. One admin console (owner email braj.raj@careerbuddha.in) with first-login password reset. Admin creates/assigns multiple team members, each reachable via a unique invite URL, sees online/offline status, and can delete members. Per-user tabs: Parse Resume (AI parsing into a shared searchable candidate DB with downloadable resumes and 17 fields incl. photo), Client Details, Business Development (leads + AI HR suggestions), Joining Details (user + admin visibility), Advanced Search (download resumes), Celebrations (birthdays/anniversaries of team + candidates with present employer). Feature upgrade toggles for admin. Elegant professional white UI with the Career Buddha Buddha logo and warm saffron accents.

## Architecture
- Frontend: Vite + React 19 + Tailwind v4 + shadcn/ui. Token (JWT) in localStorage `cb_token`. AuthContext + heartbeat (30s). Tabs in Dashboard.
- Backend: FastAPI + MongoDB (motor). Modules: server.py (routes), auth_utils.py (JWT/bcrypt), parsing.py (Gemini resume parsing + photo extraction), storage_utils.py (Emergent Object Storage), email_utils.py (Resend invite emails + safety gate).
- Integrations: Emergent Universal LLM key → Gemini 2.5 Flash (resume parse + BD suggestions); Emergent Object Storage (resume/photo files); Emergent-managed Resend (invite emails); Emergent-managed Google sign-in (alternate login).

## User Personas
- Admin/Owner (Braj Raj): manages team, access links, feature flags, sees everything.
- Team Member/Recruiter: parses resumes, manages clients/BD/joinings, searches shared DB.

## Core Requirements (static)
1. Single admin, first-login password reset. 2. Invite-URL onboarding for members. 3. Online/offline (heartbeat). 4. Delete members. 5. Shared candidate DB from AI parsing (17 fields). 6. Downloadable resumes. 7. Clients, BD (+AI), Joinings (scoped), Advanced Search, Celebrations. 8. Feature upgrade toggles. 9. White + saffron professional theme with logo.

## Implemented (2026-10-01)
- Custom email/password JWT auth + forced first-login password reset + Emergent Google sign-in (owner email auto-provisioned as admin; others must be invited).
- Admin Console: create member (unique invite link + emailed via Resend), list with live online/offline/invited status, copy/regenerate invite, delete member, 8 feature toggles.
- Parse Resume: PDF/DOCX upload → Gemini extracts 17 fields + best-effort photo → stored in Object Storage + shared candidate DB.
- Candidate Database: shared, instant search, view detail, download resume.
- Client Details CRUD; Business Development leads CRUD + AI HR suggestions; Joining Details (member sees own, admin sees all); Advanced multi-field Search + download; Celebrations (team + candidates, birthdays/anniversaries, present company).
- Verified: 36/36 backend tests + frontend smoke all pass.

## Backlog / Remaining
- P1: Return 404 on PUT/DELETE of missing resources; login brute-force lockout; explicit CORS origins.
- P2: Split server.py into per-module routers; scheduled daily celebration/BD follow-up email digests; candidate photo manual upload fallback.

## Next Tasks
- Await user feedback after first login; implement scheduled reminders if desired.

## Desktop App (2026-06, this session)
- Added `/app/desktop/` Electron wrapper (main.js, preload.js, package.json) opening the web app in a branded desktop window. Icon built from user's Career Buddha logo (build/icon.png + icon.ico).
- Windows x64 portable build produced via electron-builder `--dir` (ARM64 container cannot run wine, so NSIS installer / exe-icon embedding not possible locally; win-unpacked packed before the sign step).
- Backend download route `GET /api/desktop/windows` streams `/app/desktop/release/CareerBuddha360Suite-Windows.zip` (118 MB). Tested via curl (200, application/zip). Build artifacts gitignored.
- `.github/workflows/build-windows.yml`: GitHub Actions on windows-latest to build the proper branded NSIS installer .exe (recommended polished option).
- NOTE: main.js APP_URL now points to PRODUCTION `https://careerbuddha.emergent.host`.
- Desktop ZIP hosted in Emergent Object Storage (object path `desktop/CareerBuddha360Suite-Windows.zip`); route `GET /api/desktop/windows` streams it from storage (works in production). Upload script: `/app/scripts/upload_desktop_zip.py`.
- Dashboard header has an "Install App" button (`install-desktop-app-button`) linking to the download. Requires a redeploy to appear in production.
- electron-updater auto-update wired via `publish: github`; run the "Build Windows Desktop App" workflow with publish=true (no tag push needed) to publish Release v1.0.0. Fixed installer name `CareerBuddha360Suite-Setup.exe` (nsis.artifactName).
- Code-signing wired in workflow via `CSC_LINK`/`CSC_KEY_PASSWORD` GitHub secrets (activates automatically when present; needs a real CA cert to remove SmartScreen warning).
- Smart "Install App" button: frontend calls `GET /api/desktop/latest`; if env `GITHUB_REPO` (format owner/repo) is set it links to the latest GitHub Release installer, else falls back to `/api/desktop/windows` (ZIP). Set `GITHUB_REPO` in backend/.env + as a production secret to enable installer mode.
