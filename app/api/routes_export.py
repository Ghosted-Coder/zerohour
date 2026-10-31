from fastapi import APIRouter, HTTPException, Response
from app.core.exporters import generate_cleaned_csv, generate_filters_xml, generate_unsubscribe_csv
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/sessions", tags=["export"])

@router.get("/{session_id}/export/filters.xml")
async def export_filters(session_id: str):
    sess = await session_store.get_session(session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Session not found."}})
    async with sess.lock:
        xml_content, warnings = generate_filters_xml(sess.clusters, sess.emails)
        sess.warnings.extend(warnings)
        return Response(content=xml_content, media_type="application/xml", headers={"Content-Disposition": 'attachment; filename="filters.xml"'})

@router.get("/{session_id}/export/cleaned.csv")
async def export_cleaned_csv(session_id: str):
    sess = await session_store.get_session(session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Session not found."}})
    async with sess.lock:
        return Response(content=generate_cleaned_csv(sess.emails, sess.clusters), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="cleaned.csv"'})

@router.get("/{session_id}/export/unsubscribe.csv")
async def export_unsubscribe_csv(session_id: str):
    sess = await session_store.get_session(session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Session not found."}})
    async with sess.lock:
        csv_text, _, warnings = generate_unsubscribe_csv(sess.clusters)
        sess.warnings.extend(warnings)
        return Response(content=csv_text, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="unsubscribe.csv"'})
