from typing import List
from app.models import EmailThreat

DEMO_THREATS_POOL: List[dict] = [
    {"id": "THR-001", "sender": "Security Verify", "sender_email": "security@alert-verify.com", "subject": "CRITICAL: Security Infiltration Node", "category": "phishing", "threat_level": 5, "opt_out_link": None},
    {"id": "THR-002", "sender": "Crypto Syndicate", "sender_email": "marketing@crypto-surge.net", "subject": "FLASH EXPLOIT: Automated Bot Syndicate", "category": "spam", "threat_level": 3, "opt_out_link": "https://crypto-surge.net/unsub"},
    {"id": "THR-003", "sender": "Recon Telemetry", "sender_email": "beacon@recon-telemetry.io", "subject": "INTRUSION: Port Scan Cluster", "category": "newsletter", "threat_level": 2, "opt_out_link": "https://recon-telemetry.io/optout"},
    {"id": "THR-004", "sender": "Credential Probe", "sender_email": "bdr@enterprise-phish.biz", "subject": "TROJAN: Credential Harvester Probe", "category": "phishing", "threat_level": 4, "opt_out_link": None},
    {"id": "THR-005", "sender": "Darknet Bot", "sender_email": "promo@darknet-spambot.org", "subject": "SURGE: High Frequency Newsletter DDoS", "category": "spam", "threat_level": 2, "opt_out_link": "https://darknet-spambot.org/remove"},
    {"id": "THR-006", "sender": "Loan Scammer", "sender_email": "claims@instant-credit-surge.biz", "subject": "URGENT: $50,000 Unclaimed Transfer", "category": "phishing", "threat_level": 5, "opt_out_link": None},
    {"id": "THR-007", "sender": "Marketing Blast", "sender_email": "deals@mega-retail-discounts.com", "subject": "FLASH SALE: 90% Off Everything Today", "category": "promotions", "threat_level": 2, "opt_out_link": "https://mega-retail-discounts.com/optout"},
    {"id": "THR-008", "sender": "Social Bot", "sender_email": "notify@social-connect-network.info", "subject": "14 People Viewed Your Cyber Profile", "category": "social", "threat_level": 2, "opt_out_link": "https://social-connect-network.info/unsub"},
]

def generate_threat_dataset(difficulty: str) -> List[EmailThreat]:
    # +10 BOTS ADDED TO EACH DIFFICULTY
    target_counts = {"recruit": 16, "veteran": 24, "elite": 32}
    total = target_counts.get(difficulty.lower(), 24)
    
    dataset: List[EmailThreat] = []
    idx = 1
    while len(dataset) < total:
        for base in DEMO_THREATS_POOL:
            if len(dataset) >= total:
                break
            wave_num = (idx // len(DEMO_THREATS_POOL)) + 1
            threat_id = f"THR-{idx:03d}"
            dataset.append(EmailThreat(
                id=threat_id,
                sender=base["sender"],
                sender_email=base["sender_email"],
                subject=f"{base['subject']} [Wave #{wave_num}]" if wave_num > 1 else base["subject"],
                category=base["category"],
                threat_level=base["threat_level"],
                opt_out_link=base["opt_out_link"],
                message_count=wave_num * 3,
                message_ids=[f"msg-{idx}-{j}" for j in range(wave_num * 3)]
            ))
            idx += 1
    return dataset
