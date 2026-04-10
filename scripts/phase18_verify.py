# -*- coding: utf-8 -*-
"""
Phase 18 — 運用・監視・セキュリティ（計画書）のうち、リポジトリ内で検証できる部分。

- Python: scripts/yahoo_scrape_guard.py（YAHOO_SCRAPE_DISABLED / CI 等）
- ネットワーク取得は行わない（skip_network=True）

詳細: docs/yahoo_npb_game_data_integration_plan.md § Phase 18
"""

from __future__ import annotations

import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from yahoo_scrape_guard import ensure_yahoo_network_fetch_allowed  # noqa: E402


def main() -> int:
    print("[phase18] Python ガード: scripts/yahoo_scrape_guard.py")
    print(f"  YAHOO_SCRAPE_DISABLED={os.environ.get('YAHOO_SCRAPE_DISABLED', '')!r}")
    print(f"  CI={os.environ.get('CI', '')!r}")
    print(f"  YAHOO_SCRAPE_ENABLED={os.environ.get('YAHOO_SCRAPE_ENABLED', '')!r}")
    ensure_yahoo_network_fetch_allowed(skip_network=True)
    print("[phase18] OK（skip_network=True のため HTTP 取得は行いません）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
