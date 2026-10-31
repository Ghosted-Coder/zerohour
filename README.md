# ZeroHour: Operation Digital Reckoning

> **Problem Statement (Verbatim)**:
> *"We all procrastinate on painful digital chores - cleaning out 5,000 unread emails, sorting messy folders, reviewing expenses, or fixing lint errors. Build an experience where playing a fast-paced game or interactive story actually executes the real-world chore in the background."*

ZeroHour transforms the overwhelming chore of 5,000 unread emails into an engaging, 40-to-60 decision tactical operations game.

## The Honest Execution Model
- **"applied_in_session"**: Changes the loaded dataset in the active session. Live Gmail is altered only when the user imports `filters.xml`.
- **Unsubscribe Safety**: Opt-out links are exported to `unsubscribe.csv` for manual followup; never visited automatically.
- **Privacy Guarantee**: Uploads are processed once in memory and discarded. Raw bodies are never persisted.

## Technical Architecture
- **Backend**: Python 3.12, FastAPI, Pydantic v2.
- **AI**: Google GenAI SDK (`gemini-2.5-flash`, `gemini-embedding-2`).
- **Database**: Cloud Firestore (leaderboard & sessions) with in-memory fallback.
- **Frontend**: Dependency-free HTML5 Canvas radar map, Web Audio API procedural sound synthesizer, and accessible HUD.

## How to Import filters.xml to Gmail
1. Open Gmail > Settings (Gear Icon) > **See all settings**.
2. Click **Filters and Blocked Addresses** tab.
3. Click **Import filters** (bottom).
4. Select downloaded `filters.xml` and click **Open file**.
5. Check **"Apply new filters to existing email"** and click **Create filters**.
