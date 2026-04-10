# -*- coding: utf-8 -*-
"""
Phase 8: Yahoo スポーツナビ向けネットワーク取得の統一ガード（計画書 Phase 8）。

環境変数:
- YAHOO_SCRAPE_DISABLED=1 … 取得中止（exit 2）。本番ホストのデフォルト推奨。
- CI 上では … YAHOO_SCRAPE_ENABLED=1 が無い限り中止（誤クロール防止）。
- Phase2 の --skip-fetch 時はネットワークに出ないためガードをスキップ可。

詳細: docs/yahoo_npb_game_data_integration_plan.md Phase 8
"""

from __future__ import annotations

import os
import sys


def _env_truthy(name: str) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def ensure_yahoo_network_fetch_allowed(*, skip_network: bool = False) -> None:
    """
    ネットワーク取得の直前に呼ぶ。条件を満たさなければ stderr に出して exit(2)。
    skip_network: True のときは何もしない（キャッシュ・ローカルJSONのみのモード用）。
    """
    if skip_network:
        return
    if _env_truthy("YAHOO_SCRAPE_DISABLED"):
        print(
            "[Phase8/yahoo_scrape_guard] YAHOO_SCRAPE_DISABLED が設定されているため中止しました。"
            " ローカルキャッシュのみなら Phase2 は --skip-fetch、"
            " zone_stats は --from-debug を使うか、変数を外してください。",
            file=sys.stderr,
        )
        sys.exit(2)
    ci = (os.environ.get("CI") or "").strip()
    if ci and not _env_truthy("YAHOO_SCRAPE_ENABLED"):
        print(
            "[Phase8/yahoo_scrape_guard] CI 環境では YAHOO_SCRAPE_ENABLED=1 が無い限り"
            " Yahoo への HTTP 取得をしません（誤実行防止）。",
            file=sys.stderr,
        )
        sys.exit(2)
