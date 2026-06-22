"""npb_player_unified ユニットテスト（オフライン）"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from lib.npb_player_unified import (  # noqa: E402
    is_japanese_listed_name,
    strip_age_from_birth,
    to_initial_lastname,
)


def test_strip_age_from_birth():
    assert strip_age_from_birth("1990年1月1日（35歳）") == "1990年1月1日"
    assert strip_age_from_birth("1990年1月1日(35歳)") == "1990年1月1日"
    assert "歳" not in strip_age_from_birth("1985年3月10日（40歳）")


def test_to_initial_lastname_japanese():
    assert to_initial_lastname("Saitoh Makoto", is_japanese=True) == "M.Saitoh"
    assert to_initial_lastname("M.Itoh", is_japanese=True) == "M.Itoh"


def test_is_japanese_name():
    assert is_japanese_listed_name("江川　卓")
    assert not is_japanese_listed_name("Alexander Armenta")


if __name__ == "__main__":
    test_strip_age_from_birth()
    test_to_initial_lastname_japanese()
    test_is_japanese_name()
    print("ok")
