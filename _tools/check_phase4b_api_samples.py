import json
import urllib.request
from pathlib import Path

ids = [
    "01005153",
    "1003884",
    "1003886",
    "1003888",
    "1003889",
    "1005112",
    "1005113",
    "1005114",
    "1005116",
    "1005117",
    "1005130",
    "1005132",
    "1005133",
    "1005134",
    "1005135",
    "1005136",
    "1005137",
    "1005138",
    "1005139",
    "1005153",
]

print("=== profile-merged API sample ===")
for pid in ids:
    url = f"http://localhost:3001/api/players/{pid}/profile-merged"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
        payload = data.get("payload") or {}
        profile = payload.get("profile") or {}
        print(
            pid,
            "hasData=", data.get("hasData"),
            "name=", payload.get("name_ja"),
            "birth=", profile.get("birth_date_raw"),
            "debut=", profile.get("pro_debut_raw"),
            "career=", profile.get("career_raw"),
        )
    except Exception as e:
        print(pid, "ERROR", repr(e))
