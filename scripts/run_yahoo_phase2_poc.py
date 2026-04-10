#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Yahoo!スポーツナビ Phase 2 PoC: 1試合を取得し正規化JSONを出力する。

計画: docs/yahoo_npb_game_data_integration_plan.md
出力: _data/scraped_games/{game_id}.normalized.json
生HTML: _data/scraped_games/raw/{game_id}/{tab}.html（.gitignore 推奨）

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
# Phase 1: 識別可能な UA
UA = "TopPage-Phase2-PoC/1.0 (+local-dev; yahoo-npb-game-scrape)"

PLAYER_RE = re.compile(r"/npb/player/(\d+)/")


def fetch_html(url: str, timeout: float = 45) -> tuple[str | None, int | None, str | None]:
    headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text, r.status_code, r.headers.get("content-type", "")
    except Exception as e:
        print(f"  fetch error: {url} -> {e}", file=sys.stderr)
        return None, None, None


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def composite_fingerprint(parts: list[tuple[str, str]]) -> str:
    """
    複数ソースの sha256 を束ねた fingerprint。
    parts: [(kind, sha256hex), ...]
    """
    payload = "\n".join([f"{k}:{v}" for k, v in sorted(parts)])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_lineups_score(soup: BeautifulSoup) -> list[dict[str, Any]]:
    root = soup.select_one("#pitchesDetail")
    if not root:
        return []
    blocks: list[dict[str, Any]] = []
    for sec in root.select("section.bb-splits__item"):
        h = sec.select_one(".bb-head02__title, h3.bb-head02__title")
        team_name = h.get_text(strip=True) if h else ""
        roster: list[dict[str, Any]] = []
        for row in sec.select("table.bb-splitsTable tr.bb-splitsTable__row"):
            tds = row.find_all("td", recursive=False)
            if len(tds) < 4:
                continue
            a = tds[2].select_one('a[href*="/npb/player/"]')
            if not a:
                continue
            m = PLAYER_RE.search(a.get("href", ""))
            roster.append(
                {
                    "battingOrder": tds[0].get_text(strip=True),
                    "fieldingPosition": tds[1].get_text(strip=True),
                    "playerName": a.get_text(strip=True),
                    "yahooPlayerId": m.group(1) if m else None,
                    "bats": tds[3].get_text(strip=True) if len(tds) > 3 else None,
                    "avgDisplay": tds[4].get_text(strip=True) if len(tds) > 4 else None,
                }
            )
        if team_name or roster:
            blocks.append({"teamName": team_name, "startingLineup": roster})
    return blocks


def parse_scoreboard(soup: BeautifulSoup) -> list[dict[str, Any]]:
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
        innings: list[str] = []
        for td in tr.select("td.bb-gameScoreTable__data"):
            if "bb-gameScoreTable__data--team" in (td.get("class") or []):
                continue
            s = td.select_one("a.bb-gameScoreTable__score")
            innings.append(s.get_text(strip=True) if s else td.get_text(strip=True))
        totals = tr.select("td.bb-gameScoreTable__total")
        row: dict[str, Any] = {
            "teamName": team_name,
            "yahooTeamId": m.group(1) if m else None,
            "innings": innings,
        }
        if len(totals) >= 1:
            row["runs"] = totals[0].get_text(strip=True)
        if len(totals) >= 2:
            row["hits"] = totals[1].get_text(strip=True)
        if len(totals) >= 3:
            row["errors"] = totals[2].get_text(strip=True)
        rows_out.append(row)
    return rows_out


def parse_text_sections(soup: BeautifulSoup) -> list[dict[str, Any]]:
    live = soup.select_one("#text_live")
    if not live:
        return []
    out: list[dict[str, Any]] = []
    for sec in live.select("section.bb-liveText"):
        head = sec.select_one(".bb-liveText__inning")
        title = head.get_text(strip=True) if head else ""
        lines: list[str] = []
        for p in sec.select("p.bb-liveText__summary"):
            lines.append(re.sub(r"\s+", " ", p.get_text(" ", strip=True)))
        out.append({"sectionTitle": title, "lines": lines})
    return out


def parse_stats_player_rows(soup: BeautifulSoup, limit: int = 80) -> list[dict[str, Any]]:
    """出場成績ページ: 選手リンク付き行をざっくり抽出（列は可変のためセルは文字列配列）。"""
    rows_out: list[dict[str, Any]] = []
    for tr in soup.select("tr"):
        if len(rows_out) >= limit:
            break
        a = tr.select_one('a[href*="/npb/player/"][href$="/top"]')
        if not a:
            continue
        m = PLAYER_RE.search(a.get("href", ""))
        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"], recursive=False)]
        rows_out.append(
            {
                "yahooPlayerId": m.group(1) if m else None,
                "playerName": a.get_text(strip=True),
                "cells": cells,
            }
        )
    return rows_out


def meta_from_soup(soup: BeautifulSoup) -> dict[str, Any]:
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    og = soup.select_one('meta[property="og:title"]')
    og_title = og.get("content", "").strip() if og else ""
    return {"documentTitle": title, "ogTitle": og_title}


def all_yahoo_player_ids(html: str) -> dict[str, str]:
    """player_id -> 初出の表示名（近似）"""
    out: dict[str, str] = {}
    for m in re.finditer(
        r'href="(?:https://baseball\.yahoo\.co\.jp)?/npb/player/(\d+)/top"[^>]*>([^<]+)<',
        html,
    ):
        pid, name = m.group(1), m.group(2).strip()
        if pid not in out:
            out[pid] = name
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Yahoo Phase2 PoC: fetch + normalize one game")
    ap.add_argument("--game-id", default="2021038624", help="10桁試合ID")
    ap.add_argument("--sleep", type=float, default=1.2, help="リクエスト間隔(秒)")
    ap.add_argument("--skip-fetch", action="store_true", help="raw HTML が既にある場合のみ再パース")
    args = ap.parse_args()

    ensure_yahoo_network_fetch_allowed(skip_network=args.skip_fetch)

    root = Path(__file__).resolve().parent.parent
    out_dir = root / "_data" / "scraped_games"
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    gid = args.game_id
    raw_game_dir = raw_dir / gid
    raw_game_dir.mkdir(parents=True, exist_ok=True)
    tabs = [
        ("score", f"{BASE}/npb/game/{gid}/score"),
        ("text", f"{BASE}/npb/game/{gid}/text"),
        ("stats", f"{BASE}/npb/game/{gid}/stats"),
        ("top", f"{BASE}/npb/game/{gid}/top"),
    ]

    sources: dict[str, Any] = {}
    html_by_tab: dict[str, str] = {}
    saved_files: list[dict[str, Any]] = []
    fp_parts: list[tuple[str, str]] = []
    source_urls: list[str] = []

    for tab, url in tabs:
        path = raw_game_dir / f"{tab}.html"
        source_urls.append(url)
        if args.skip_fetch and path.is_file():
            html_by_tab[tab] = path.read_text(encoding="utf-8")
            sha = sha256_hex(html_by_tab[tab])
            fp_parts.append((tab, sha))
            sources[tab] = {
                "url": url,
                "status": "from_cache",
                "bytes": len(html_by_tab[tab]),
                "sha256": sha,
            }
            saved_files.append(
                {
                    "name": f"{tab}.html",
                    "kind": "html",
                    "sizeBytes": len(html_by_tab[tab].encode("utf-8")),
                }
            )
            continue
        html, status, ct = fetch_html(url)
        time.sleep(args.sleep)
        if html:
            path.write_text(html, encoding="utf-8")
            html_by_tab[tab] = html
            sha = sha256_hex(html)
            fp_parts.append((tab, sha))
            sources[tab] = {
                "url": url,
                "httpStatus": status,
                "contentType": ct,
                "bytes": len(html),
                "sha256": sha,
            }
            saved_files.append(
                {
                    "name": f"{tab}.html",
                    "kind": "html",
                    "sizeBytes": len(html.encode("utf-8")),
                }
            )
        else:
            sources[tab] = {"url": url, "error": True}

    manifest = {
        "schemaVersion": "yahoo-raw-manifest-v1",
        "gameId": gid,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUrls": source_urls,
        "files": saved_files,
        "fingerprint": composite_fingerprint(fp_parts),
        "parserVersion": "TopPage-Phase2-PoC/1.0",
    }
    (raw_game_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    score_html = html_by_tab.get("score", "")
    text_html = html_by_tab.get("text", "")
    stats_html = html_by_tab.get("stats", "")

    score_soup = BeautifulSoup(score_html, "lxml") if score_html else None
    text_soup = BeautifulSoup(text_html, "lxml") if text_html else None
    stats_soup = BeautifulSoup(stats_html, "lxml") if stats_html else None

    normalized: dict[str, Any] = {
        "schemaVersion": "yahoo-game-normalized-v0",
        "gameId": gid,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "meta": meta_from_soup(score_soup) if score_soup else {},
        "scoreboard": parse_scoreboard(score_soup) if score_soup else [],
        "lineupsFromScore": parse_lineups_score(score_soup) if score_soup else [],
        "textPlayByPlay": parse_text_sections(text_soup) if text_soup else [],
        "statsPlayerLinkedRows": parse_stats_player_rows(stats_soup) if stats_soup else [],
        "yahooPlayersMentioned": {},
        "missingOrPartial": [],
        "pitchByPitch": {
            "status": "not_fetched",
            "note": "一球ごとのコース・球速は score?index=... の個別ページまたはXHRが必要（既存 scripts/fetch_game_pitch_types.py 等）",
        },
    }

    merged_players: dict[str, str] = {}
    for h in html_by_tab.values():
        for pid, name in all_yahoo_player_ids(h).items():
            merged_players.setdefault(pid, name)
    normalized["yahooPlayersMentioned"] = merged_players

    if not text_html:
        normalized["missingOrPartial"].append("text: fetch failed or empty")
    elif not normalized["textPlayByPlay"]:
        normalized["missingOrPartial"].append("text: no #text_live sections in static HTML")

    if not stats_html:
        normalized["missingOrPartial"].append("stats: fetch failed or empty")

    if not score_html:
        normalized["missingOrPartial"].append("score: fetch failed — lineups/scoreboard unavailable")

    out_json = out_dir / f"{gid}.normalized.json"
    out_json.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {out_json}")
    print(f"Raw HTML dir: {raw_game_dir}")


if __name__ == "__main__":
    main()
