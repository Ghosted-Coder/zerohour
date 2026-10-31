from typing import List
from app.models import EmailThreat

DEMO_THREATS_POOL: List[dict] = [
    {"id": "THR-001", "sender": "security@alert-verify.com", "subject": "CRITICAL: Security Infiltration Node #1", "category": "phishing", "threat_level": 5, "opt_out_link": None},
    {"id": "THR-002", "sender": "marketing@crypto-surge.net", "subject": "FLASH EXPLOIT: Automated Bot Syndicate", "category": "spam", "threat_level": 3, "opt_out_link": "https://crypto-surge.net/unsub"},
    {"id": "THR-003", "sender": "beacon@recon-telemetry.io", "subject": "INTRUSION: Unauthorized Port Scan Cluster", "category": "newsletter", "threat_level": 2, "opt_out_link": "https://recon-telemetry.io/optout"},
    {"id": "THR-004", "sender": "bdr@enterprise-phish.biz", "subject": "TROJAN: Credential Harvester Probe", "category": "phishing", "threat_level": 4, "opt_out_link": None},
    {"id": "THR-005", "sender": "promo@darknet-spambot.org", "subject": "SURGE: High Frequency Newsletter DDoS", "category": "spam", "threat_level": 2, "opt_out_link": "https://darknet-spambot.org/remove"},
]

def generate_threat_dataset(difficulty: str) -> List[EmailThreat]:
    multiplier = {"recruit": 1, "veteran": 2, "elite": 3}.get(difficulty, 2)
    dataset = []
    idx = 1
    for m in range(multiplier):
        for base in DEMO_THREATS_POOL:
            threat_id = f"THR-{idx:03d}"
            dataset.append(EmailThreat(
                id=threat_id,
                sender=base["sender"],
                subject=f"{base['subject']} [Cluster #{m+1}]" if m > 0 else base["subject"],
                category=base["category"],
                threat_level=base["threat_level"],
                opt_out_link=base["opt_out_link"]
            ))
            idx += 1
    return dataset
