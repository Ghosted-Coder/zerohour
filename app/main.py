import uuid
from typing import Dict
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.models import DemoRegistrationRequest, SessionState
from app.demo_data import generate_threat_dataset

app = FastAPI(
    title="ZeroHour: Operation Digital Reckoning",
    description="Email Chore Remediation Tactical Engine",
    version="1.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ACTIVE_SESSIONS: Dict[str, SessionState] = {}

@app.post("/api/demo/register", response_model=SessionState)
async def register_demo_session(req: DemoRegistrationRequest):
    clean_callsign = req.callsign.strip().upper()
    if not clean_callsign:
        raise HTTPException(status_code=400, detail="Callsign cannot be empty.")

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
        filters_generated=0,
        threats=threats
    )
    ACTIVE_SESSIONS[session_id] = session
    return session

@app.get("/api/demo/session/{session_id}", response_model=SessionState)
async def get_session(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Operation session not found.")
    return session

@app.post("/api/demo/session/{session_id}/triage")
async def record_triage(session_id: str, payload: dict):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session expired.")

    threat_id = payload.get("threat_id")
    action = payload.get("action", "purge")

    for threat in session.threats:
        if threat.id == threat_id:
            threat.action = action
            threat.applied_in_session = True
            session.threats_neutralized += 1
            if action in ["purge", "quarantine"]:
                session.filters_generated += 1
            break

    return {"status": "ok", "neutralized": session.threats_neutralized, "total": session.threats_total}

@app.get("/api/demo/session/{session_id}/export/filters.xml")
async def export_filters_xml(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    purged_senders = list({
        t.sender for t in session.threats
        if t.applied_in_session and t.action in ["purge", "quarantine"]
    })

    sender_query = " OR ".join(purged_senders) if purged_senders else "spam-demo@zerohour.internal"

    xml_content = f"""<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>ZeroHour Tactical Remediations - {session.callsign}</title>
  <id>tag:zerohour,2026:filters:{session.session_id}</id>
  <updated>2026-10-31T09:00:00Z</updated>
  <entry>
    <category term='filter'></category>
    <title>ZeroHour Threat Purge Rule</title>
    <apps:property name='from' value='{sender_query}'/>
    <apps:property name='shouldTrash' value='true'/>
    <apps:property name='neverSpam' value='false'/>
  </entry>
</feed>
"""
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=filters_{session.callsign}.xml"}
    )

@app.get("/api/demo/session/{session_id}/export/unsubscribe.csv")
async def export_unsubscribe_csv(session_id: str):
    session = ACTIVE_SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    csv_rows = ["ThreatID,Sender,Subject,UnsubscribeLink"]
    for t in session.threats:
        if t.opt_out_link:
            csv_rows.append(f'"{t.id}","{t.sender}","{t.subject}","{t.opt_out_link}"')

    csv_content = "\n".join(csv_rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=unsubscribe_{session.callsign}.csv"}
    )

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")
