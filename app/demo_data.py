from typing import List
from app.models import EmailThreat

DEMO_THREATS_POOL: List[dict] = [
    {
        "id": "THR-001",
        "sender": "no-reply@security-alert-verify.com",
        "subject": "CRITICAL: Immediate Password Reset Required for Banking",
        "category": "phishing",
        "threat_level": 5,
        "opt_out_link": None
    },
    {
        "id": "THR-002",
        "sender": "marketing@mega-discount-deals.net",
        "subject": "FLASH SALE: 80% Off Gadgets You Don't Need - Ends Midnight",
        "category": "spam",
        "threat_level": 2,
        "opt_out_link": "https://mega-discount-deals.net/unsub?id=8831"
    },
    {
        "id": "THR-003",
        "sender": "newsletter@daily-crypto-insider.io",
        "subject": "Daily Digest: 10 Coins That Might Do Something Today",
        "category": "newsletter",
        "threat_level": 1,
        "opt_out_link": "https://daily-crypto-insider.io/manage-subscription"
    },
    {
        "id": "THR-004",
        "sender": "bdr@enterprise-synergy-solutions.biz",
        "subject": "Quick 15 min chat on scaling your outbound SDR team?",
        "category": "cold_outreach",
        "threat_level": 3,
        "opt_out_link": "https://enterprise-synergy-solutions.biz/opt-out"
    },
    {
        "id": "THR-005",
        "sender": "rewards@loyalty-points-expire-now.org",
        "subject": "FINAL NOTICE: Your 45,000 Reward Points Will Be Cleared",
        "category": "phishing",
        "threat_level": 4,
        "opt_out_link": None
    },
    {
        "id": "THR-006",
        "sender": "info@fast-loans-instant-approval.co",
        "subject": "Pre-Approved: $50,000 Business Line of Credit Ready",
        "category": "spam",
        "threat_level": 3,
        "opt_out_link": "https://fast-loans-instant-approval.co/unsubscribe"
    },
    {
        "id": "THR-007",
        "sender": "editor@morning-tech-bulletin.org",
        "subject": "Tech Rundown: AI Models, Cloud Migrations, and Framework Wars",
        "category": "newsletter",
        "threat_level": 1,
        "opt_out_link": "https://morning-tech-bulletin.org/sub/cancel"
    },
    {
        "id": "THR-008",
        "sender": "sales@hyper-growth-leads-generator.info",
        "subject": "B2B Lead lists at 90% discount - Q4 clearance",
        "category": "cold_outreach",
        "threat_level": 2,
        "opt_out_link": "https://hyper-growth-leads-generator.info/remove"
    },
    {
        "id": "THR-009",
        "sender": "account@stream-video-renewal-notice.com",
        "subject": "Your Subscription Is Suspended Due To Payment Failure",
        "category": "phishing",
        "threat_level": 5,
        "opt_out_link": None
    },
    {
        "id": "THR-010",
        "sender": "promo@cheap-flights-last-minute.travel",
        "subject": "Fly to Paris for $199? Weekend getaway deals inside",
        "category": "spam",
        "threat_level": 2,
        "opt_out_link": "https://cheap-flights-last-minute.travel/unsub"
    }
]

def generate_threat_dataset(difficulty: str) -> List[EmailThreat]:
    multiplier = {"recruit": 2, "veteran": 4, "elite": 6}.get(difficulty, 3)
    dataset = []
    idx = 1
    for m in range(multiplier):
        for base in DEMO_THREATS_POOL:
            threat_id = f"THR-{idx:03d}"
            dataset.append(EmailThreat(
                id=threat_id,
                sender=base["sender"],
                subject=f"{base['subject']} [Wave #{m+1}]" if m > 0 else base["subject"],
                category=base["category"],
                threat_level=base["threat_level"],
                opt_out_link=base["opt_out_link"]
            ))
            idx += 1
    return dataset
