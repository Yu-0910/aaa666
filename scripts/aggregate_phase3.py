#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
aggregate_phase3.py

個人ページ作成計画書 Phase 3: 選手・年度・条件別の集計
plate_appearances_normalized.csv から打撃・投手の集計テーブルを生成する。
"""

import csv
import sys
import io
from pathlib import Path
from collections import defaultdict

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


def _int(x, default=0):
    try:
        return int(x) if x else 0
    except (ValueError, TypeError):
        return default


def _float_fmt(x):
    if x is None or (isinstance(x, float) and (x != x or x == float('inf'))):
        return ""
    return f"{x:.3f}" if isinstance(x, float) else str(x)


def aggregate_batting(rows: list[dict]) -> dict:
    """打撃集計（1プレイヤー×1スプリット）"""
    pa = sum(1 for r in rows if _int(r.get("is_pa")))
    ab = sum(_int(r.get("ab")) for r in rows)
    h = sum(_int(r.get("h")) for r in rows) + sum(_int(r.get("h2")) for r in rows) + sum(_int(r.get("h3")) for r in rows) + sum(_int(r.get("hr")) for r in rows)
    h1 = sum(_int(r.get("h")) for r in rows)
    h2 = sum(_int(r.get("h2")) for r in rows)
    h3 = sum(_int(r.get("h3")) for r in rows)
    hr = sum(_int(r.get("hr")) for r in rows)
    bb = sum(_int(r.get("bb")) for r in rows)
    hbp = sum(_int(r.get("hbp")) for r in rows)
    so = sum(_int(r.get("so")) for r in rows)
    sh = sum(_int(r.get("sh")) for r in rows)
    sf = sum(_int(r.get("sf")) for r in rows)
    gidp = sum(_int(r.get("gidp")) for r in rows)
    rbi = sum(_int(r.get("rbi")) for r in rows)
    r = sum(_int(r.get("r")) for r in rows)
    ibb = sum(_int(r.get("ibb")) for r in rows)
    sb = sum(_int(r.get("sb")) for r in rows)
    cs = sum(_int(r.get("cs")) for r in rows)
    games = len(set(r.get("game_id", "") for r in rows))

    # 塁打
    tb = h1 + h2 * 2 + h3 * 3 + hr * 4

    avg = (h / ab) if ab > 0 else None
    obp = (h + bb + hbp) / (ab + bb + hbp + sf) if (ab + bb + hbp + sf) > 0 else None
    slg = (tb / ab) if ab > 0 else None
    ops = (obp + slg) if obp is not None and slg is not None else None

    # 得点圏打率
    risp_rows = [r for r in rows if _int(r.get("risp")) and _int(r.get("is_pa"))]
    risp_ab = sum(_int(r.get("ab")) for r in risp_rows)
    risp_h = sum(_int(r.get("h")) for r in risp_rows) + sum(_int(r.get("h2")) for r in risp_rows) + sum(_int(r.get("h3")) for r in risp_rows) + sum(_int(r.get("hr")) for r in risp_rows)
    risp_avg = (risp_h / risp_ab) if risp_ab > 0 else None

    # 盗塁成功率（ブロックA）
    sb_pct = sb / (sb + cs) if (sb + cs) > 0 else None

    # セイバーメトリクス（ブロックD）lib/ranking/leaders.ts 準拠
    isop = (slg - avg) if avg is not None and slg is not None else None
    isod = (obp - avg) if avg is not None and obp is not None else None
    babip_denom = ab - so - hr + sf
    babip = (h - hr) / babip_denom if babip_denom > 0 else None
    bb_pct = (bb / pa * 100) if pa > 0 else None
    k_pct = (so / pa * 100) if pa > 0 else None
    bbk = (bb / so) if so > 0 else None
    gpa = ((1.8 * obp + slg) / 4) if obp is not None and slg is not None else None
    rc_denom = ab + bb
    rc = ((h + bb) * tb / rc_denom) if rc_denom > 0 else None
    xr = 0.50 * h1 + 0.72 * h2 + 1.04 * h3 + 1.44 * hr + 0.33 * (bb + hbp) + 0.18 * sb - 0.32 * cs - 0.098 * (ab - h)
    seca = (bb + (tb - h)) / ab if ab > 0 else None
    ta_denom = ab + bb + hbp + cs
    ta = (tb + bb + hbp + sb) / ta_denom if ta_denom > 0 else None
    noi = (obp + slg / 3) * 1000 if obp is not None and slg is not None else None

    return {
        "g": games, "pa": pa, "ab": ab, "r": r, "h": h, "h1": h1, "h2": h2, "h3": h3, "hr": hr, "tb": tb,
        "bb": bb, "ibb": ibb, "hbp": hbp, "so": so, "sh": sh, "sf": sf, "gidp": gidp, "rbi": rbi,
        "sb": sb, "cs": cs,
        "avg": avg, "obp": obp, "slg": slg, "ops": ops, "risp_avg": risp_avg,
        "risp_ab": risp_ab, "risp_h": risp_h,
        "sb_pct": sb_pct, "isop": isop, "isod": isod, "babip": babip,
        "bb_pct": bb_pct, "k_pct": k_pct, "bbk": bbk, "gpa": gpa,
        "rc": rc, "xr": xr, "seca": seca, "ta": ta, "noi": noi,
    }


def aggregate_pitching(rows: list[dict]) -> dict:
    """投手集計"""
    bf = len(rows)
    ab = sum(_int(r.get("ab")) for r in rows)
    h = sum(_int(r.get("h")) for r in rows) + sum(_int(r.get("h2")) for r in rows) + sum(_int(r.get("h3")) for r in rows) + sum(_int(r.get("hr")) for r in rows)
    hr = sum(_int(r.get("hr")) for r in rows)
    bb = sum(_int(r.get("bb")) for r in rows)
    so = sum(_int(r.get("so")) for r in rows)
    hbp = sum(_int(r.get("hbp")) for r in rows)
    games = len(set(r.get("game_id", "") for r in rows))

    whip = (h + bb) / (bf / 3) if bf > 0 else None
    k9 = (so * 9) / (bf / 3) if bf > 0 else None
    bb9 = (bb * 9) / (bf / 3) if bf > 0 else None

    return {
        "g": games, "bf": bf, "ab": ab, "h": h, "hr": hr, "bb": bb, "so": so, "hbp": hbp,
        "whip": whip, "k9": k9, "bb9": bb9,
    }


def main():
    root = Path(__file__).resolve().parent.parent
    data_dir = root / "_data" / "yahoo_games_pilot"
    pa_path = data_dir / "plate_appearances_normalized.csv"
    out_dir = data_dir

    if not pa_path.exists():
        print(f"❌ {pa_path} が存在しません。Phase 2 を先に実行してください。")
        sys.exit(1)

    rows = []
    with open(pa_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["year"] = (row.get("date", "") or "")[:4]
            rows.append(row)

    # スプリット条件の定義 (key_func -> split_key)
    def split_key_total(r):
        return ("total",)

    def split_key_day_night(r):
        dn = (r.get("day_night") or "").strip()
        if dn == "デーゲーム":
            return ("day",)
        if dn == "ナイター":
            return ("night",)
        return None

    def split_key_home_away(r):
        ih = _int(r.get("is_home"))
        return ("home",) if ih == 1 else ("visitor",)

    def split_key_opponent(r):
        opp = (r.get("opponent_team") or "").strip()
        if opp:
            return ("vs", opp)
        return None

    def split_key_bat_order(r):
        """スタメン1〜9番（lineup_slot）を優先。無い試合のみ従来どおりテキスト速報の bat_order（イニング内何番目）。"""
        slot = (r.get("lineup_slot") or "").strip().rstrip("：")
        if slot.isdigit():
            n = int(slot)
            if 1 <= n <= 9:
                return ("bat_order", str(n))
        bo = (r.get("bat_order") or "").strip().rstrip("：")
        if bo and bo.isdigit():
            return ("bat_order", bo)
        return None

    split_funcs = [
        ("total", lambda r: True, split_key_total),
        ("day_night", lambda r: r.get("day_night"), split_key_day_night),
        ("home_away", lambda r: True, split_key_home_away),
        ("vs_team", lambda r: r.get("opponent_team"), split_key_opponent),
        ("bat_order", lambda r: r.get("bat_order"), split_key_bat_order),
    ]

    # 打撃集計
    bat_groups = defaultdict(list)
    for r in rows:
        bid = r.get("batter_id", "")
        if not bid:
            continue
        year = r.get("year", "")
        if not year:
            continue
        for name, cond, key_fn in split_funcs:
            if not cond(r):
                continue
            k = key_fn(r)
            if k is None:
                continue
            sk = "_".join(str(x) for x in k)
            bat_groups[(bid, year, name, sk)].append(r)

    bat_out = []
    for (bid, year, split_type, split_val), group_rows in bat_groups.items():
        agg = aggregate_batting(group_rows)
        if agg["pa"] == 0:
            continue
        bat_out.append({
            "player_id": bid,
            "year": year,
            "split_type": split_type,
            "split_value": split_val,
            "g": agg["g"], "pa": agg["pa"], "ab": agg["ab"], "r": agg["r"],
            "h": agg["h"], "h1": agg["h1"], "h2": agg["h2"], "h3": agg["h3"], "hr": agg["hr"],
            "bb": agg["bb"], "ibb": agg["ibb"], "hbp": agg["hbp"], "so": agg["so"],
            "sh": agg["sh"], "sf": agg["sf"], "gidp": agg["gidp"], "rbi": agg["rbi"],
            "sb": agg["sb"], "cs": agg["cs"],
            "avg": _float_fmt(agg["avg"]), "obp": _float_fmt(agg["obp"]),
            "slg": _float_fmt(agg["slg"]), "ops": _float_fmt(agg["ops"]),
            "risp_avg": _float_fmt(agg["risp_avg"]), "risp_ab": agg["risp_ab"], "risp_h": agg["risp_h"],
            "sb_pct": _float_fmt(agg["sb_pct"]), "isop": _float_fmt(agg["isop"]), "isod": _float_fmt(agg["isod"]),
            "babip": _float_fmt(agg["babip"]), "bb_pct": _float_fmt(agg["bb_pct"]), "k_pct": _float_fmt(agg["k_pct"]),
            "bbk": _float_fmt(agg["bbk"]), "gpa": _float_fmt(agg["gpa"]),
            "rc": _float_fmt(agg["rc"]), "xr": _float_fmt(agg["xr"]), "seca": _float_fmt(agg["seca"]),
            "ta": _float_fmt(agg["ta"]), "noi": _float_fmt(agg["noi"]),
        })

    bat_path = out_dir / "batting_stats.csv"
    bat_fields = ["player_id", "year", "split_type", "split_value", "g", "pa", "ab", "r", "h", "h1", "h2", "h3", "hr",
                  "bb", "ibb", "hbp", "so", "sh", "sf", "gidp", "rbi", "sb", "cs",
                  "avg", "obp", "slg", "ops", "risp_avg", "risp_ab", "risp_h",
                  "sb_pct", "isop", "isod", "babip", "bb_pct", "k_pct", "bbk", "gpa", "rc", "xr", "seca", "ta", "noi"]
    with open(bat_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=bat_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(bat_out)
    print(f"✅ batting_stats.csv: {len(bat_out)}行 -> {bat_path}")

    # 投手集計（pitcher_id でグループ化）
    pit_groups = defaultdict(list)
    for r in rows:
        pid = r.get("pitcher_id", "")
        if not pid:
            continue
        year = r.get("year", "")
        if not year:
            continue
        pit_groups[(pid, year, "total", "total")].append(r)

        dn = r.get("day_night", "")
        if dn == "デーゲーム":
            pit_groups[(pid, year, "day_night", "day")].append(r)
        elif dn == "ナイター":
            pit_groups[(pid, year, "day_night", "night")].append(r)

        ih = _int(r.get("is_home"))
        # 投手視点: is_home=0→打者はアウェイ→投手はホーム側, is_home=1→打者はホーム→投手はビジター側
        pit_groups[(pid, year, "home_away", "home" if ih == 0 else "visitor")].append(r)

    pit_out = []
    for (pid, year, split_type, split_val), group_rows in pit_groups.items():
        agg = aggregate_pitching(group_rows)
        if agg["bf"] == 0:
            continue
        pit_out.append({
            "player_id": pid,
            "year": year,
            "split_type": split_type,
            "split_value": split_val,
            "g": agg["g"], "bf": agg["bf"], "ab": agg["ab"], "h": agg["h"], "hr": agg["hr"],
            "bb": agg["bb"], "so": agg["so"], "hbp": agg["hbp"],
            "whip": _float_fmt(agg["whip"]), "k9": _float_fmt(agg["k9"]), "bb9": _float_fmt(agg["bb9"]),
        })

    pit_path = out_dir / "pitching_stats.csv"
    pit_fields = ["player_id", "year", "split_type", "split_value", "g", "bf", "ab", "h", "hr", "bb", "so", "hbp",
                  "whip", "k9", "bb9"]
    with open(pit_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pit_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(pit_out)
    print(f"✅ pitching_stats.csv: {len(pit_out)}行 -> {pit_path}")


if __name__ == "__main__":
    main()
