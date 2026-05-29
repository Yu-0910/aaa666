# -*- coding: utf-8 -*-
"""canonical paId の形式（SSOT）。末尾は打順ではなく半回内打席通し番号（pa_seq_in_half）。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

PAID_RE = re.compile(r"^(\d+)-(\d+)-(表|裏)-(\d+)$")


@dataclass(frozen=True)
class ParsedPaId:
    game_id: str
    inning: int
    half: Literal["表", "裏"]
    pa_seq_in_half: int  # 打順ではない
    raw: str


def parse_pa_id(pa_id: str) -> ParsedPaId | None:
    m = PAID_RE.match(str(pa_id or "").strip())
    if not m:
        return None
    return ParsedPaId(
        game_id=m.group(1),
        inning=int(m.group(2)),
        half=m.group(3),  # type: ignore[arg-type]
        pa_seq_in_half=int(m.group(4)),
        raw=str(pa_id).strip(),
    )


def build_pa_id(game_id: str, inning: int, half: str, pa_seq_in_half: int) -> str:
    return f"{game_id}-{inning}-{half}-{pa_seq_in_half}"


def pa_seq_in_half_to_score_index_prefix(inning: str | int, top_bottom: str, pa_seq_in_half: str | int) -> str:
    tb = "1" if top_bottom == "表" else "2"
    return f"{int(inning):02d}{tb}{int(pa_seq_in_half):02d}00"
