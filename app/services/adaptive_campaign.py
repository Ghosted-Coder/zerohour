import uuid
from typing import List
from app.models import InboxAnalysisSummary, AdaptiveCampaign, AdaptiveMission, SenderCluster

def generate_personalized_campaign(analysis: InboxAnalysisSummary, session_id: str, is_real: bool = False) -> AdaptiveCampaign:
    """
    ZEROHOUR ADAPTIVE CAMPAIGN ENGINE
    Analyzes live inbox telemetry and generates tailored tactical missions.
    """
    missions: List[AdaptiveMission] = []
    clusters = analysis.top_senders

    # Partition clusters by intelligence category
    promo_clusters = [c for c in clusters if c.category in ["promotions", "spam"]]
    newsletter_clusters = [c for c in clusters if c.category in ["newsletter", "social"]]
    protected_clusters = [c for c in clusters if c.category in ["finance", "work", "personal"]]

    # MISSION A: ELIMINATE THE CLUTTER (High-volume commercial senders)
    if promo_clusters:
        affected = sum(c.email_count for c in promo_clusters[:3])
        missions.append(AdaptiveMission(
            mission_id=f"MSN-CLUTTER-{uuid.uuid4().hex[:4].upper()}",
            title="OPERATION: PURGE COMMERCIAL SATURATION",
            mission_type="eliminate_clutter",
            objective_text=f"Eliminate {len(promo_clusters[:3])} high-volume promotional bot nodes ({affected} emails)",
            target_senders=promo_clusters[:3],
            affected_emails=affected,
            proposed_action="archive",
            risk_level="LOW"
        ))

    # MISSION B: STOP REINFORCEMENTS (Newsletters & Subscription Beacons)
    if newsletter_clusters:
        affected = sum(c.email_count for c in newsletter_clusters[:3])
        missions.append(AdaptiveMission(
            mission_id=f"MSN-REINFORCE-{uuid.uuid4().hex[:4].upper()}",
            title="OPERATION: SEVER SUBSCRIPTION BEACONS",
            mission_type="stop_reinforcements",
            objective_text=f"Disable {len(newsletter_clusters[:3])} recurring newsletters via automated Gmail filters",
            target_senders=newsletter_clusters[:3],
            affected_emails=affected,
            proposed_action="filter",
            risk_level="LOW"
        ))

    # MISSION C: PROTECT INTELLIGENCE (Shield financial & vital personal mail)
    if protected_clusters:
        affected = sum(c.email_count for c in protected_clusters[:2])
        missions.append(AdaptiveMission(
            mission_id=f"MSN-PROTECT-{uuid.uuid4().hex[:4].upper()}",
            title="OPERATION: FORTIFY VITAL ASSETS",
            mission_type="protect_intelligence",
            objective_text=f"Secure and verify {len(protected_clusters[:2])} sensitive financial/work communications",
            target_senders=protected_clusters[:2],
            affected_emails=affected,
            proposed_action="protect",
            risk_level="MEDIUM"
        ))

    # Fallback default mission if inbox is already clean
    if not missions:
        missions.append(AdaptiveMission(
            mission_id="MSN-MAINTAIN-001",
            title="OPERATION: DIGITAL PERIMETER PATROL",
            mission_type="perimeter_control",
            objective_text="Sweep active sectors for residual tracking beacons and verify system integrity",
            target_senders=clusters[:2] if clusters else [],
            affected_emails=sum(c.email_count for c in clusters[:2]) if clusters else 0,
            proposed_action="archive",
            risk_level="LOW"
        ))

    campaign_title = f"OPERATION DIGITAL RECKONING // SECTOR-{session_id[-4:]}"
    return AdaptiveCampaign(
        campaign_id=f"CMP-{uuid.uuid4().hex[:8].upper()}",
        title=campaign_title,
        description=f"Automated intelligence identified {analysis.clutter_messages_count} clutter emails across {analysis.total_clusters} sender domains.",
        inbox_clutter_score=analysis.clutter_ratio * 100.0,
        total_clutter_emails=analysis.clutter_messages_count,
        missions=missions,
        is_real_gmail=is_real
    )
