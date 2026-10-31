from typing import List, Dict, Any, Optional
import httpx

class GmailClient:
    def __init__(self, access_token: str):
        self.token = access_token
        self.headers = {"Authorization": f"Bearer {access_token}"}
        self.base_url = "https://gmail.googleapis.com/gmail/v1/users/me"

    async def list_inbox_messages(self, max_results: int = 40) -> List[Dict[str, Any]]:
        list_url = f"{self.base_url}/messages?maxResults={max_results}&q=in:inbox"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(list_url, headers=self.headers)
            if res.status_code != 200:
                return []
            data = res.json()
            messages = data.get("messages", [])

            detailed_messages = []
            for m in messages:
                m_id = m.get("id")
                detail_url = f"{self.base_url}/messages/{m_id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe"
                d_res = await client.get(detail_url, headers=self.headers)
                if d_res.status_code == 200:
                    d_json = d_res.json()
                    headers_list = d_json.get("payload", {}).get("headers", [])
                    h_map = {h["name"].lower(): h["value"] for h in headers_list if "name" in h and "value" in h}
                    detailed_messages.append({
                        "id": m_id,
                        "from": h_map.get("from", "Unknown"),
                        "subject": h_map.get("subject", "(No Subject)"),
                        "date": h_map.get("date", ""),
                        "list_unsubscribe": h_map.get("list-unsubscribe", ""),
                        "snippet": d_json.get("snippet", "")
                    })
            return detailed_messages
