import random
from datetime import datetime, timedelta, timezone
from typing import List, Tuple
from app.core.models import Email, EmailState
from app.core.normalize import is_protected_text, normalize_subject_template

TEMPLATES = [
    ("Morning Brew", "crew@morningbrew.com", "Morning Brew: Today's Tech Roundup #{num}", "Tech updates and business trends.", True, "https://morningbrew.com/unsub"),
    ("TLDR Newsletter", "dan@tldr.tech", "TLDR AI #{num}: New models and breaking benchmarks", "Interesting stories in AI and code.", True, "https://tldr.tech/unsub"),
    ("Substack Reads", "digest@substack.com", "Substack Reads: Essays on craftsmanship #{num}", "Curated long-form stories and culture.", True, "https://substack.com/unsub"),
    ("Hacker News Digest", "digest@hndigest.com", "Hacker News Weekly Top #{num}", "Top discussions on programming and startups.", True, "https://hndigest.com/unsub"),
    ("Python Weekly", "news@pythonweekly.com", "Python Weekly Issue #{num}", "Latest Python articles and packages.", True, "https://pythonweekly.com/unsub"),
    ("Data Elixir", "lon@dataelixir.com", "Data Elixir #{num} - Clean Data Pipelines", "Weekly curation of data science tools.", True, "https://dataelixir.com/unsub"),
    ("Nike Store", "marketing@nike.com", "Flash Sale: Up to 40% Off Running Shoes #{num}", "Exclusive member discounts on footwear.", True, "https://nike.com/unsub"),
    ("Steam Store", "noreply@steampowered.com", "Steam Weekend Deal: Top RPGs on Sale #{num}", "Discounts on your wishlist games.", True, "https://steampowered.com/unsub"),
    ("Coursera", "updates@coursera.org", "Learn Cloud Computing with 50% Off #{num}", "Master AWS and GCP architectures.", True, "https://coursera.org/unsub"),
    ("Uber Eats", "eats@uber.com", "Craving dinner? Here is $10 off your next feast #{num}", "Use code YUMMY10 on select orders.", True, "https://uber.com/unsub"),
    ("Medium Daily", "noreply@medium.com", "Stories for you: Software architecture #{num}", "Recommended reads based on history.", True, "https://medium.com/unsub"),
    ("Udemy Courses", "promotions@udemy.com", "Flash Deal: $9.99 Tech Courses #{num}", "Build modern backend services.", True, "https://udemy.com/unsub"),
    ("LinkedIn", "notifications@linkedin.com", "You appeared in 18 searches this week #{num}", "See who viewed your profile.", True, "https://linkedin.com/unsub"),
    ("Twitter / X", "info@twitter.com", "New notifications for your recent post #{num}", "Top replies and mentions.", True, "https://twitter.com/unsub"),
    ("GitHub", "notifications@github.com", "[GitHub] Pull Request #314 merged in org/backend #{num}", "Review changes and CI logs.", False, None),
    ("GitLab CI", "gitlab@devops.internal", "Pipeline #8912 passed on master branch #{num}", "All 42 integration tests passed.", False, None),
    ("Amazon Orders", "orders@amazon.com", "Your Amazon.com order confirmation #{num}", "Order confirmed. We will notify you on dispatch.", False, None),
    ("Apple Billing", "receipts@apple.com", "Your receipt from Apple for iCloud+ Storage #{num}", "Billed to card ending in 4112.", False, None),
    ("Stripe Invoicing", "invoicing@stripe.com", "Invoice 9012 paid for Cloud Hosting #{num}", "Payment received. Download PDF receipt.", False, None),
    ("Chase Bank", "alerts@chase.com", "Security Alert: New Sign-in Attempt Detected #{num}", "Detected sign-in from new device.", False, None),
    ("Google Account", "no-reply@accounts.google.com", "Security alert: Password changed successfully #{num}", "Google account password was updated.", False, None),
    ("MegaMart Store", "store@megamart.com", "MegaMart Weekly Promo: 50% Off Electronics #{num}", "Save big on TVs and tech.", True, "https://megamart.com/unsub"),
    ("MegaMart Store", "store@megamart.com", "MegaMart Order Confirmation and Receipt #{num}", "Payment received for order MM-8120.", False, None),
    ("MegaMart Store", "store@megamart.com", "MegaMart Security: One-Time Password #{num}", "Security verification code: 662910.", False, None),
]

PERSONAL_SENDERS = [
    ("Alice Smith", "alice.smith@gmail.com", "Catching up this weekend?", "Hey, let me know if free Saturday afternoon."),
    ("Uncle Bob", "uncle.bob@gmail.com", "Weekly Family Newsletter & Digest", "Here is what the family did this week!"),
    ("David Miller", "dmiller@outlook.com", "Notes from lunch meeting", "Shared draft document. Let me know thoughts."),
    ("Sarah Jenkins", "sarah.j@yahoo.com", "Dinner party recipes", "Here is that pasta recipe we talked about!"),
]

def generate_demo_inbox() -> Tuple[List[Email], List[str]]:
    rng = random.Random(42)
    emails: List[Email] = []
    start_date = datetime(2023, 10, 1, tzinfo=timezone.utc)
    total_target = 5000

    for i in range(60):
        p_name, p_addr, p_subj, p_snip = rng.choice(PERSONAL_SENDERS)
        email_date = start_date + timedelta(days=rng.randint(0, 540), hours=rng.randint(0, 23))
        emails.append(Email(
            id=f"demo_personal_{i}", sender_name=p_name, sender_address=p_addr, sender_domain=p_addr.split("@")[-1],
            subject=f"{p_subj} #{i+1}", subject_template=normalize_subject_template(p_subj), date=email_date,
            snippet=p_snip, unread=rng.random() < 0.70, has_unsubscribe=False, protected_flag=is_protected_text(p_subj, p_snip),
            state=EmailState.INBOX
        ))

    for i in range(total_target - len(emails)):
        t_name, t_addr, t_subj_raw, t_snip, has_unsub, unsub_url = rng.choice(TEMPLATES)
        num = rng.randint(100, 9999)
        subj = t_subj_raw.replace("#{num}", str(num))
        email_date = start_date + timedelta(days=rng.randint(0, 540), hours=rng.randint(0, 23))
        is_prot = is_protected_text(subj, t_snip)
        emails.append(Email(
            id=f"demo_bulk_{i}", sender_name=t_name, sender_address=t_addr, sender_domain=t_addr.split("@")[-1],
            subject=subj, subject_template=normalize_subject_template(subj), date=email_date,
            snippet=f"{t_snip} Ref: {num}", unread=rng.random() < 0.70, has_unsubscribe=has_unsub,
            unsubscribe_target=unsub_url, protected_flag=is_prot, state=EmailState.INBOX
        ))

    return emails, []
