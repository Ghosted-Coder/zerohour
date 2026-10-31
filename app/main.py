import uuid
import time
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from app.models import (
    DemoRegistrationRequest, SessionState, EmailThreat,
    InboxAnalysisSummary, CleanupOperationRequest, AuditReport,
    AdaptiveCampaign
)
from app.demo_data import generate_threat_dataset
from app.security import SecurityHeadersMiddleware, RateLimiterMiddleware, sanitize_input_text
from app.services import gmail_auth
from app.services.gmail_client import GmailClient
from app.services.inbox_intelligence import cluster_and_analyze_messages
from app.services.execution_engine import SafeExecutionEngine, AUDIT_LOGS
from app.services.adaptive_campaign import generate_personalized_campaign

app = FastAPI(title="ZeroHour AI-Powered Gmail Automation Engine")

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# PREVENT SAFARI BROWSER SCRIPT CACHING
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

ACTIVE_SESSIONS: Dict[str, SessionState] = {}
ACTIVE_CAMPAIGNS: Dict[str, AdaptiveCampaign] = {}
LATEST_ANALYSIS: Dict[str, InboxAnalysisSummary] = {}
SERVER_START_TIME = time.time()

@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "uptime_seconds": round(time.time() - SERVER_START_TIME, 1)}

@app.get("/api/metrics")
async def get_system_metrics():
    return {
        "active_sessions": len(ACTIVE_SESSIONS),
        "active_campaigns": len(ACTIVE_CAMPAIGNS),
        "audit_logs_recorded": sum(len(v) for v in AUDIT_LOGS.values())
    }

@app.post("/api/demo/register", response_model=SessionState)
async def register_session(req: DemoRegistrationRequest):
    clean_callsign = sanitize_input_text(req.callsign.strip().upper(), 24)
    threats = generate_threat_dataset(req.difficulty)
    session_id = f"ZH-{uuid.uuid4().hex[:8].upper()}"

    session = SessionState(
        session_id=session_id,
        callsign=clean_callsign,
        email=req.email.lower().strip(),
        difficulty=req.difficulty,
        threats_total=len(threats),
        threats_neutralized=0,
        inbox_integrity=100.0,
        is_real_gmail=False,
        threats=threats
    )
    ACTIVE_SESSIONS[session_id] = session

    mock_raw = [{
        "id": t.id,
        "from": f"{t.sender} <{t.sender_email}>",
        "subject": t.subject,
        "date": "Sat, 31 Oct 2026",
        "list_unsubscribe": t.opt_out_link,
        "snippet": t.subject
    } for t in threats]
    summary = cluster_and_analyze_messages(mock_raw, cache_key=f"demo-{session_id}")
    LATEST_ANALYSIS[session_id] = summary
    ACTIVE_CAMPAIGNS[session_id] = generate_personalized_campaign(summary, session_id, is_real=False)

    return session

@app.get("/api/demo/session/{session_id}", response_model=SessionState)
async def get_session(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Operation session not found.")
    return session

@app.get("/api/auth/google/url")
async def get_oauth_url(session_id: str):
    url = gmail_auth.generate_google_auth_url(session_id)
    return {"auth_url": url, "configured": bool(gmail_auth.settings.GOOGLE_CLIENT_ID)}

@app.get("/api/auth/google/callback")
async def oauth_callback(code: str, state: str):
    tokens = await gmail_auth.exchange_code_for_tokens(code, state)
    if not tokens:
        return RedirectResponse("/?auth_status=failed")
    return RedirectResponse("/?auth_status=connected")

@app.get("/api/auth/status")
async def get_auth_status(session_id: str):
    connected = gmail_auth.is_gmail_connected(session_id)
    return {"connected": connected, "session_id": session_id}

@app.post("/api/auth/disconnect")
async def disconnect_auth(session_id: str):
    success = gmail_auth.disconnect_gmail(session_id)
    return {"disconnected": success}

@app.post("/api/inbox/analyze", response_model=InboxAnalysisSummary)
async def analyze_inbox(session_id: str):
    token = await gmail_auth.get_valid_access_token(session_id)
    if token:
        client = GmailClient(token)
        raw_messages = await client.list_inbox_messages(max_results=50)
        summary = cluster_and_analyze_messages(raw_messages, cache_key=f"live-{session_id}")
        LATEST_ANALYSIS[session_id] = summary
        campaign = generate_personalized_campaign(summary, session_id, is_real=True)
        ACTIVE_CAMPAIGNS[session_id] = campaign

        if session_id in ACTIVE_SESSIONS:
            sess = ACTIVE_SESSIONS[session_id]
            sess.is_real_gmail = True
            real_threats = []
            for i, c in enumerate(summary.top_senders):
                real_threats.append(EmailThreat(
                    id=f"REAL-{i+1:03d}",
                    sender=c.sender_name,
                    sender_email=c.sender_email,
                    subject=f"[{c.email_count} emails] {c.sample_subjects[0] if c.sample_subjects else c.sender_email}",
                    category=c.category if c.category in ["phishing", "spam", "newsletter", "social", "promotions", "finance", "work", "personal"] else "promotions",
                    threat_level=min(5, max(1, c.email_count)),
                    opt_out_link=c.opt_out_link,
                    message_count=c.email_count,
                    message_ids=c.message_ids
                ))
            sess.threats = real_threats
            sess.threats_total = len(real_threats)
        return summary

    summary = LATEST_ANALYSIS.get(session_id)
    if not summary:
        threats = generate_threat_dataset("veteran")
        mock_raw = [{"id": t.id, "from": f"{t.sender} <{t.sender_email}>", "subject": t.subject, "date": "Sat, 31 Oct 2026", "list_unsubscribe": t.opt_out_link, "snippet": t.subject} for t in threats]
        summary = cluster_and_analyze_messages(mock_raw, cache_key=f"demo-{session_id}")
        LATEST_ANALYSIS[session_id] = summary
        ACTIVE_CAMPAIGNS[session_id] = generate_personalized_campaign(summary, session_id, is_real=False)

    return summary

@app.get("/api/campaign/{session_id}", response_model=AdaptiveCampaign)
async def get_active_campaign(session_id: str):
    campaign = ACTIVE_CAMPAIGNS.get(session_id)
    if not campaign:
        summary = LATEST_ANALYSIS.get(session_id)
        if not summary:
            threats = generate_threat_dataset("veteran")
            mock_raw = [{"id": t.id, "from": f"{t.sender} <{t.sender_email}>", "subject": t.subject, "date": "Sat, 31 Oct 2026", "list_unsubscribe": t.opt_out_link, "snippet": t.subject} for t in threats]
            summary = cluster_and_analyze_messages(mock_raw)
            LATEST_ANALYSIS[session_id] = summary
        campaign = generate_personalized_campaign(summary, session_id, is_real=False)
        ACTIVE_CAMPAIGNS[session_id] = campaign
    return campaign

@app.post("/api/inbox/execute", response_model=AuditReport)
async def execute_cleanup(req: CleanupOperationRequest):
    token = await gmail_auth.get_valid_access_token(req.session_id)
    token_str = token if token else "SANDBOX_MOCK_TOKEN"
    executor = SafeExecutionEngine(token_str, req.session_id)
    return await executor.execute_plan(req.operations)

@app.get("/api/inbox/audit/{session_id}", response_model=AuditReport)
async def get_audit_report(session_id: str):
    items = AUDIT_LOGS.get(session_id, [])
    return AuditReport(
        total_operations=len(items),
        succeeded=sum(1 for i in items if i.status == "SUCCEEDED"),
        failed=sum(1 for i in items if i.status == "FAILED"),
        archived_emails=sum(i.message_count for i in items if i.action == "archive" and i.status == "SUCCEEDED"),
        filters_created=sum(1 for i in items if i.action == "filter" and i.status == "SUCCEEDED"),
        items=items
    )

@app.get("/api/demo/session/{session_id}/export/filters.xml")
async def export_filters_xml(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    callsign = session.callsign if session else "OPERATOR"
    xml_content = f"""<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>ZeroHour Automation Rules - {callsign}</title>
  <entry>
    <title>Clutter Purge Rule</title>
    <apps:property name='from' value='marketing@promo.internal OR updates@noise.io'/>
    <apps:property name='shouldTrash' value='true'/>
  </entry>
</feed>"""
    return Response(content=xml_content, media_type="application/xml")

@app.get("/api/demo/session/{session_id}/export/unsubscribe.csv")
async def export_unsubscribe_csv(session_id: str):
    csv_rows = ["SenderEmail,Category,UnsubscribeLink"]
    csv_rows.append("deals@mega-retail.com,promotions,https://mega-retail.com/optout")
    return Response(content="\n".join(csv_rows), media_type="text/csv")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")
