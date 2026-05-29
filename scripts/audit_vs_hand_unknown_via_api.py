import json
import os
import sys
import time
import urllib.request
from glob import glob


def fetch_json(url: str, timeout: float = 20.0) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as f:
        return json.load(f)


def main():
    year = "2026"
    base_url = os.environ.get("TOPPAGE_BASE_URL", "http://localhost:3000").rstrip("/")
    year = os.environ.get("TOPPAGE_YEAR", year)

    root = os.getcwd()
    pattern = os.path.join(root, "_data", "derived", "player_season_batting", year, "yahoo_*.json")
    files = sorted(glob(pattern))
    if not files:
        print(f"[audit_vs_hand_unknown] no files matched: {pattern}", file=sys.stderr)
        return 2

    out_dir = os.path.join(root, "_data", "derived", "audit")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"vs_hand_unknown_{year}.json")

    results = []
    errors = []

    t0 = time.time()
    for i, fp in enumerate(files):
        bn = os.path.basename(fp)
        # yahoo_1100061.json -> 1100061
        yahoo_id = bn.replace("yahoo_", "").replace(".json", "")
        url = f"{base_url}/api/players/{yahoo_id}/season-stats?year={year}&debug=1"
        try:
            d = fetch_json(url, timeout=25.0)
            payload = d.get("payload") or {}
            stats = payload.get("stats") or []
            debug = d.get("debug") or {}

            unknown_row = None
            for r in stats:
                if r.get("split_type") == "vs_hand" and r.get("split_value") == "unknown":
                    unknown_row = r
                    break

            unknown_pa = int(unknown_row.get("pa")) if unknown_row and unknown_row.get("pa") is not None else 0
            if unknown_pa <= 0 and not (debug.get("unknownPitchers") or debug.get("missingPitcherIdPas")):
                continue

            results.append(
                {
                    "yahooBatterId": yahoo_id,
                    "unknownPa": unknown_pa,
                    "unknownPitchers": debug.get("unknownPitchers") or [],
                    "missingPitcherIdPas": debug.get("missingPitcherIdPas") or 0,
                    "missingPitcherIdSamples": debug.get("missingPitcherIdSamples") or [],
                }
            )
        except Exception as e:
            errors.append({"yahooBatterId": yahoo_id, "url": url, "error": str(e)})

        # progress
        if (i + 1) % 50 == 0:
            elapsed = time.time() - t0
            print(f"[audit_vs_hand_unknown] {i+1}/{len(files)} checked ({elapsed:.1f}s)")

    # sort: unknown PA desc, then missing pitcher id desc
    results.sort(key=lambda x: (int(x.get("unknownPa") or 0), int(x.get("missingPitcherIdPas") or 0)), reverse=True)

    report = {
        "schemaVersion": "vs-hand-unknown-audit-v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "year": year,
        "baseUrl": base_url,
        "checkedFiles": len(files),
        "playersWithUnknownOrMissing": len(results),
        "results": results,
        "errors": errors,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"[audit_vs_hand_unknown] wrote: {out_path}")
    print(f"[audit_vs_hand_unknown] playersWithUnknownOrMissing={len(results)} errors={len(errors)}")
    if results:
        top = results[:10]
        print("[audit_vs_hand_unknown] top10:")
        for r in top:
            print(
                f"  yahooBatterId={r['yahooBatterId']} unknownPa={r['unknownPa']} missingPitcherIdPas={r['missingPitcherIdPas']} unknownPitchers={len(r.get('unknownPitchers') or [])}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

