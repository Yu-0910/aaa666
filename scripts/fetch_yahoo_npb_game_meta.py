#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Yahoo!スポーツナビ NPB 試合一覧・試合速報（score）から、定期取得向けの試合メタを保存する。

取得する情報（score ページの静的 HTML から抽出）:
  - タイトル / og:title（開催日・対戦カード）
  - スコアボード先頭行=ビジター、2 行目=ホーム（Yahoo 表示順）
  - 開始時刻（例: 18:00）、球場名（例: マツダスタジアム）
  - デー / ナイター（ページに「ナイター」「デーゲーム」等があれば優先、無ければ開始時刻から推定）

使い方:
  python scripts/fetch_yahoo_npb_game_meta.py --game-id 2021038624
  python scripts/fetch_yahoo_npb_game_meta.py --game-ids 2021038624,2021038625
  python scripts/fetch_yahoo_npb_game_meta.py --schedule-date 2026-03-27

定期実行（例・ローカル）:
  YAHOO_SCRAPE_ENABLED=1 python scripts/fetch_yahoo_npb_game_meta.py --schedule-date $(date +%%F)

環境変数: scripts/yahoo_scrape_guard.py 参照（CI では YAHOO_SCRAPE_ENABLED=1 が必要）

出力:
  _data/yahoo_game_meta/{gameId}.json
  --also-index で _data/yahoo_game_meta/_index.jsonl に 1 行追記

依存: pip install requests beautifulsoup4 lxml
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install requests beautifulsoup4 lxml", file=sys.stderr)
    sys.exit(1)

BASE = "https://baseball.yahoo.co.jp"
UA = "TopPage-fetch-yahoo-game-meta/1.0 (+local-dev; npb-game-meta)"
SCHEDULE_URL = f"{BASE}/npb/schedule/"
GAME_ID_PATTERN = re.compile(r"/npb/game/(\d{10})/")
TITLE_VS_RE = re.compile(
    r"(\d{4})年(\d{1,2})月(\d{1,2})日\s*(.+?)vs\.?(.+?)(?:\s+[一試]|\s+-|一球速報|\s*\||$)"
)


def fetch_html(url: str, timeout: float = 45) -> tuple[str | None, int | None]:
    headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text, r.status_code
    except Exception as e:
        print(f"  [fetch] error {url} -> {e}", file=sys.stderr)
        return None, None


def extract_game_ids_from_schedule(html: str) -> list[str]:
    ids = set()
    for m in GAME_ID_PATTERN.finditer(html):
        ids.add(m.group(1))
    return sorted(ids)


def parse_scoreboard_teams(soup: BeautifulSoup) -> list[dict[str, Any]]:
    tbl = soup.select_one("table#ing_brd.bb-gameScoreTable")
    if not tbl:
        return []
    rows_out: list[dict[str, Any]] = []
    for tr in tbl.select("tbody tr.bb-gameScoreTable__row"):
        team_a = tr.select_one(".bb-gameScoreTable__team")
        if not team_a:
            continue
        team_name = team_a.get_text(strip=True)
        team_href = team_a.get("href", "")
        m = re.search(r"/teams/(\d+)/", team_href)
        rows_out.append(
            {
                "teamName": team_name,
                "yahooTeamId": m.group(1) if m else None,
            }
        )
    return rows_out


def parse_title_teams(title: str) -> tuple[str | None, str | None, str | None]:
    """タイトル「YYYY年M月D日 ホーム側vs.ビジター側 …」から日付とチーム名を抽出。"""
    m = TITLE_VS_RE.search(title.replace("ｖｓ", "vs").replace("ＶＳ", "vs"))
    if not m:
        return None, None, None
    y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
    date_iso = f"{y}-{mo}-{d}"
    home = m.group(4).strip()
    away = m.group(5).strip()
    return date_iso, home, away


def find_start_time_and_stadium(soup: BeautifulSoup, html: str) -> tuple[str, str]:
    """リスト要素や time タグから開始時刻・球場を推定。"""
    start_time = ""
    stadium = ""

    for li in soup.select("li"):
        t = li.get_text(" ", strip=True)
        if re.fullmatch(r"\d{1,2}:\d{2}", t):
            start_time = t
        if "スタジアム" in t or "ドーム" in t or "球場" in t:
            stadium = re.sub(r"^球場名\s*[：:]\s*", "", t).strip()

    if not start_time:
        for el in soup.find_all("time"):
            tt = el.get_text(strip=True)
            if re.fullmatch(r"\d{1,2}:\d{2}", tt):
                start_time = tt
                break

    if not start_time:
        mm = re.search(r'(\d{1,2}):(\d{2})', html[:4000])
        if mm:
            start_time = f"{int(mm.group(1))}:{mm.group(2)}"

    if not stadium:
        for pat in (r"(マツダ[^\s<]{0,20}スタジアム)", r"(東京ドーム)", r"(京セラ[^\s<]{0,12})"):
            m = re.search(pat, html)
            if m:
                stadium = m.group(1).strip()
                break

    return start_time, stadium


def infer_day_night(start_time: str, blob: str) -> None | dict[str, Any]:
    """デー / ナイター。明示ラベル > 時刻推定。"""
    if "ナイター" in blob:
        return {"kind": "night", "source": "keyword", "keyword": "ナイター"}
    if re.search(r"デ[ーイ]ゲーム|デー\s*戦|デイゲーム", blob):
        return {"kind": "day", "source": "keyword"}
    if not start_time or not re.fullmatch(r"\d{1,2}:\d{2}", start_time):
        return None
    parts = start_time.split(":")
    h = int(parts[0])
    mi = int(parts[1]) if len(parts) > 1 else 0
    # 17:00 以降をナイター寄り（公式区分と完全一致しない場合あり）
    if h > 17 or (h == 17 and mi >= 0):
        return {"kind": "night", "source": "inferred_from_start_time", "rule": "hour>=17"}
    return {"kind": "day", "source": "inferred_from_start_time", "rule": "hour<17"}


def build_payload(
    game_id: str,
    html: str,
    http_status: int,
    source_url: str,
) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    og = soup.select_one('meta[property="og:title"]')
    og_title = og.get("content", "").strip() if og else ""
    title_el = soup.find("title")
    document_title = title_el.get_text(strip=True) if title_el else ""

    date_iso, title_home, title_away = parse_title_teams(og_title or document_title)

    scoreboard_teams = parse_scoreboard_teams(soup)
    start_time, stadium = find_start_time_and_stadium(soup, html)
    blob = (og_title + document_title + html[:80000])
    day_night = infer_day_night(start_time, blob)

    sha = hashlib.sha256(html.encode("utf-8")).hexdigest()

    scoreboard_order = (
        [{"role": "visitor", **row} for row in (scoreboard_teams[:1] if scoreboard_teams else [])]
        + [{"role": "home", **row} for row in (scoreboard_teams[1:2] if len(scoreboard_teams) > 1 else [])]
    )

    return {
        "schemaVersion": "yahoo-npb-game-meta-v1",
        "gameId": game_id,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "url": source_url,
            "httpStatus": http_status,
            "htmlSha256": sha,
        },
        "meta": {
            "documentTitle": document_title,
            "ogTitle": og_title,
            "gameDateYmd": date_iso,
            "titleHomeTeamName": title_home,
            "titleVisitorTeamName": title_away,
            "startTimeLocal": start_time or None,
            "stadiumName": stadium or None,
            "dayNight": day_night,
            "scoreboardTeamOrder": scoreboard_order,
            "scoreboardTeams": scoreboard_teams,
        },
        "notes": [
            "Yahoo 表示順のスコア表は 1 行目がビジター、2 行目がホームの想定で role を付与。",
            "タイトル側の vs は「ホーム vs ビジター」表記。スコア表と突き合わせて利用すること。",
            "デー/ナイターはページに文言が無い場合は開始時刻から推定（公式区分と異なる場合あり）。",
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Yahoo NPB 試合メタ取得（スコア速報ページ）")
    ap.add_argument("--game-id", help="10桁の試合ID")
    ap.add_argument("--game-ids", help="カンマ区切りの試合ID")
    ap.add_argument("--schedule-date", help="日程ページの日付 YYYY-MM-DD（その日の試合IDを列挙）")
    ap.add_argument(
        "--out-dir",
        default="_data/yahoo_game_meta",
        help="出力ディレクトリ（プロジェクトルートからの相対）",
    )
    ap.add_argument("--sleep", type=float, default=1.2, help="試合間の待機秒")
    ap.add_argument("--dry-run", action="store_true", help="保存せず標準出力のみ")
    ap.add_argument("--also-index", action="store_true", help="_index.jsonl に追記")
    args = ap.parse_args()

    ensure_yahoo_network_fetch_allowed()

    root = Path(__file__).resolve().parent.parent
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    game_ids: list[str] = []
    if args.game_ids:
        game_ids = [x.strip() for x in args.game_ids.split(",") if x.strip()]
    elif args.game_id:
        game_ids = [args.game_id.strip()]
    elif args.schedule_date:
        url = f"{SCHEDULE_URL}?date={args.schedule_date}"
        print(f"[schedule] GET {url}")
        html, st = fetch_html(url)
        if not html:
            sys.exit(1)
        game_ids = extract_game_ids_from_schedule(html)
        print(f"[schedule] found {len(game_ids)} game id(s)")
    else:
        ap.print_help()
        sys.exit(2)

    index_path = out_dir / "_index.jsonl"
    for i, gid in enumerate(game_ids):
        if len(gid) != 10 or not gid.isdigit():
            print(f"[skip] invalid game id: {gid}", file=sys.stderr)
            continue
        url = f"{BASE}/npb/game/{gid}/score"
        print(f"[game] {gid} <- {url}")
        html, st = fetch_html(url)
        time.sleep(args.sleep)
        if not html:
            continue
        payload = build_payload(gid, html, st or 0, url)
        line = json.dumps(payload, ensure_ascii=False)
        if args.dry_run:
            print(line[:2000] + ("..." if len(line) > 2000 else ""))
        else:
            out_file = out_dir / f"{gid}.json"
            out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  wrote {out_file}")
            if args.also_index:
                with index_path.open("a", encoding="utf-8") as f:
                    f.write(line + "\n")

    print(f"[done] out_dir={out_dir}")


if __name__ == "__main__":
    main()
