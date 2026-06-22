"""
NPB 選手個人ページ統合パース（投手成績・プロフィール・ローマ字）
"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from bs4 import BeautifulSoup

NPB_PLAYER_URL = "https://npb.jp/bis/players/{player_id}.html"


def _safe_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "－"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "－"):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _parse_ip_cells(cells: List, ip_idx: int) -> Tuple[Optional[float], int]:
    if ip_idx >= len(cells):
        return None, 0
    t0 = cells[ip_idx].get_text(strip=True).replace(",", "")
    if not t0:
        return None, 1
    try:
        whole = int(t0)
    except ValueError:
        return _safe_float(t0), 1
    if ip_idx + 1 < len(cells):
        t1 = cells[ip_idx + 1].get_text(strip=True)
        if re.match(r"^\.\d+$", t1):
            return _safe_float(t0 + t1), 2
        if t1 == "+" and ip_idx + 2 < len(cells):
            t2 = cells[ip_idx + 2].get_text(strip=True)
            if t2 in ("0", "1", "2"):
                return whole + int(t2) / 3.0, 3
    return float(whole), 1


def _ip_post_extra(cells: List, ip_col_idx: Optional[int], ip_val: Optional[float], ip_cells: int) -> int:
    """
    投球回セル直後の余分セルを数える。
    - 207.2 + 207 + .2（重複分割）
    - 184 + 184 + 空（槙原1983型スペーサ）
    """
    extra = max(0, ip_cells - 1)
    if ip_val is None or ip_col_idx is None:
        return extra
    if ip_col_idx + 1 >= len(cells):
        return extra

    t1 = cells[ip_col_idx + 1].get_text(strip=True).replace(",", "")
    t2 = cells[ip_col_idx + 2].get_text(strip=True) if ip_col_idx + 2 < len(cells) else ""
    ip_whole = int(ip_val + 0.0001)

    try:
        t1_int = int(t1) if t1 else None
    except ValueError:
        t1_int = None

    if t1_int is not None and abs(t1_int - ip_whole) <= 2:
        # 207.2 の次が 207 + .2
        if ip_cells == 1 and re.match(r"^\.\d+$", t2):
            return extra + 2
        # 184 の次が 184 + 空セル
        if ip_cells == 1 and t2.strip() in ("", "-", "－"):
            return extra + 2

    return extra


def _load_team_league_map() -> Dict[str, Tuple[str, str]]:
    import ast

    path = Path(__file__).resolve().parents[1] / "scrape_2004_pitching_via_all_players.py"
    if not path.is_file():
        return {}
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "TEAM_LEAGUE_MAP":
                    return ast.literal_eval(node.value)  # type: ignore[arg-type]
    return {}


TEAM_LEAGUE_MAP: Dict[str, Tuple[str, str]] = _load_team_league_map()

PROFILE_KEYS = ("birth_date_raw", "pro_debut_raw", "career_raw")
LABEL_MAP = {
    "birth_date_raw": ("生年月日",),
    "pro_debut_raw": ("ドラフト", "入団"),
    "career_raw": ("経歴",),
}

AGE_SUFFIX_RE = re.compile(r"[（(]\s*\d{1,3}\s*歳\s*[）)]")
JAPANESE_NAME_RE = re.compile(r"[一-龠ぁ-んァ-ン・]")


def npb_id_candidates(raw_id: str) -> List[str]:
    s = (raw_id or "").strip()
    if not s:
        return []
    out: List[str] = []
    for cand in (s, s.lstrip("0") or "0", s.zfill(8), s.zfill(9)):
        if cand and cand not in out:
            out.append(cand)
    return out


def strip_age_from_birth(raw: str) -> str:
    if not raw:
        return ""
    s = AGE_SUFFIX_RE.sub("", raw).strip()
    return s


def is_japanese_listed_name(name_ja: str) -> bool:
    return bool(JAPANESE_NAME_RE.search(name_ja or ""))


def to_initial_lastname(full_name: str, is_japanese: bool = False) -> str:
    if not full_name:
        return ""
    parts = full_name.strip().split()
    if not parts:
        return ""
    if len(parts) == 1 and "." in parts[0]:
        return parts[0]
    if len(parts) == 1:
        name = parts[0].strip()
        return f"{name[0].upper()}.{name}" if name else ""
    if is_japanese:
        last_name, first_name = parts[0].strip(), parts[-1].strip()
        if not first_name or not last_name:
            return full_name
        initial = first_name[0].upper()
        last_title = last_name[0].upper() + last_name[1:].lower() if len(last_name) > 1 else last_name.upper()
        return f"{initial}.{last_title}"
    first_name, last_name = parts[0].strip(), parts[-1].strip()
    if not first_name or not last_name:
        return full_name
    initial = first_name[0].upper()
    last_title = last_name[0].upper() + last_name[1:].lower() if len(last_name) > 1 else last_name.upper()
    return f"{initial}.{last_title}"


def parse_profile_from_html(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "lxml")
    profile = {k: "" for k in PROFILE_KEYS}

    def apply(label: str, value: str) -> None:
        if not value:
            return
        label = re.sub(r"\s+", "", label)
        for key, aliases in LABEL_MAP.items():
            if profile[key]:
                continue
            if any(alias in label for alias in aliases):
                profile[key] = value

    for tr in soup.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th and td:
            apply(th.get_text() or "", (td.get_text() or "").strip())

    for dl in soup.find_all("dl"):
        for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
            apply(dt.get_text() or "", (dd.get_text() or "").strip())

    if profile["birth_date_raw"]:
        profile["birth_date_raw"] = strip_age_from_birth(profile["birth_date_raw"])
    return profile


def find_roman_name(html: str) -> Optional[str]:
    if not html:
        return None
    try:
        soup = BeautifulSoup(html, "html.parser")
        for el_id in ("pc_v_name", "pc_v_kana"):
            el = soup.find("li", id=el_id)
            if not el:
                continue
            text = el.get_text()
            match = re.search(r"[（(]([A-Za-z\s.\-']+)[）)]", text)
            if match:
                roman = match.group(1).strip()
                if not any(x in roman.upper() for x in ("NIPPON", "PROFESSIONAL", "BASEBALL", "ORGANIZATION")):
                    if 2 <= len(roman) <= 50:
                        return " ".join(w.capitalize() for w in roman.split())
            if el_id == "pc_v_kana":
                kana_text = text.strip()
                if re.match(r"^[A-Za-z\s.\-']+$", kana_text) and not re.search(r"[あ-んア-ン一-龠]", kana_text):
                    if 2 <= len(kana_text) <= 50:
                        return " ".join(w.capitalize() for w in kana_text.split())
    except Exception:
        pass
    return None


def find_team_on_page(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    el = soup.find("li", id="pc_v_team")
    if el:
        return (el.get_text() or "").strip()
    return ""


def league_for_team(team: str, fallback: str = "") -> str:
    if team in TEAM_LEAGUE_MAP:
        return TEAM_LEAGUE_MAP[team][0]
    for key, (lg, _) in TEAM_LEAGUE_MAP.items():
        if key in team or team in key:
            return lg
    return fallback


def _parse_pitching_row(
    cells: List,
    col_map: Dict[str, int],
    header_len: int,
    year: int,
    player_id: str,
    player_name_ja: str,
    team: str,
    league: str,
) -> Optional[Dict[str, Any]]:
    if col_map.get("year") is None or col_map["year"] >= len(cells):
        return None
    year_val = cells[col_map["year"]].get_text(strip=True).replace(" ", "")
    year_str = str(year)
    year_zen = str(year).translate(str.maketrans("0123456789", "０１２３４５６７８９"))
    if year_val != year_str and year_val != year_zen:
        return None

    g = (
        _safe_int(cells[col_map["G"]].get_text(strip=True))
        if col_map.get("G") is not None and col_map["G"] < len(cells)
        else None
    )
    if g is not None and g == 0:
        return None

    cols_need_old_offset = ["CG", "SHO", "WPCT", "BF", "IP", "H", "HR", "BB", "HBP", "SO", "WP", "BK", "R", "ER", "ERA"]
    cols_after_ip = ["H", "HR", "BB", "HBP", "SO", "WP", "BK", "R", "ER", "ERA"]
    old_format = (
        col_map.get("ERA") is not None
        and col_map["ERA"] >= len(cells)
        and col_map.get("CG") is not None
        and col_map["CG"] >= 2
    )

    ip_col_idx = (col_map["IP"] - 2) if old_format and col_map.get("IP") is not None else col_map.get("IP")
    ip_val, ip_cells = (
        _parse_ip_cells(cells, ip_col_idx) if ip_col_idx is not None and ip_col_idx < len(cells) else (None, 1)
    )
    ip_extra = _ip_post_extra(cells, ip_col_idx, ip_val, ip_cells)

    def _cell_idx(key: str) -> int:
        idx = col_map.get(key)
        if idx is None:
            return -1
        if old_format and key in cols_need_old_offset:
            idx -= 2
        if key in cols_after_ip:
            idx += ip_extra
        return idx

    def _read_cell(key: str, as_float: bool = False) -> Any:
        idx = _cell_idx(key)
        if idx < 0 or idx >= len(cells):
            return None
        t = cells[idx].get_text(strip=True).replace(",", "")
        if not t or t in ("-", "－"):
            return None
        return _safe_float(t) if as_float else _safe_int(t)

    h_val = _read_cell("H")
    if h_val is None and (ip_val is None or ip_val == 0) and g is not None and g <= 2:
        bf_val = _read_cell("BF")
        if bf_val is not None and bf_val > 0:
            h_val = 0

    row_data: Dict[str, Any] = {
        "year": year,
        "league": league,
        "team": team,
        "player_id": player_id,
        "player_name_ja": player_name_ja,
        "player_name_en": "",
        "G": g,
        "IP": ip_val,
        "W": _read_cell("W"),
        "L": _read_cell("L"),
        "SV": _read_cell("SV"),
        "ERA": _read_cell("ERA", as_float=True),
        "BF": _read_cell("BF"),
        "H": h_val,
        "HR": _read_cell("HR"),
        "BB": _read_cell("BB"),
        "IBB": None,
        "HBP": _read_cell("HBP"),
        "SO": _read_cell("SO"),
        "ER": _read_cell("ER"),
        "R": _read_cell("R"),
    }
    if old_format:
        row_data["HOLD"] = 0
        row_data["HP"] = 0
    else:
        if col_map.get("HOLD") is not None and _cell_idx("HOLD") < len(cells):
            row_data["HOLD"] = _safe_int(cells[_cell_idx("HOLD")].get_text(strip=True))
        if col_map.get("HP") is not None and _cell_idx("HP") < len(cells):
            row_data["HP"] = _safe_int(cells[_cell_idx("HP")].get_text(strip=True))
    for key in ("CG", "SHO"):
        if col_map.get(key) is not None and _cell_idx(key) < len(cells):
            row_data[key] = _safe_int(cells[_cell_idx(key)].get_text(strip=True))
    if col_map.get("WPCT") is not None and _cell_idx("WPCT") < len(cells):
        row_data["WPCT"] = _safe_float(cells[_cell_idx("WPCT")].get_text(strip=True))
    for key in ("WP", "BK"):
        if col_map.get(key) is not None and _cell_idx(key) < len(cells):
            row_data[key] = _safe_int(cells[_cell_idx(key)].get_text(strip=True))

    tail_slack = len(cells) - header_len
    if tail_slack > 0:
        era_tail = _safe_float(cells[-1].get_text(strip=True))
        if era_tail is not None and 0 <= era_tail <= 15:
            er_tail = _safe_int(cells[-2].get_text(strip=True))
            r_tail = _safe_int(cells[-3].get_text(strip=True))
            row_data["ERA"] = era_tail
            if er_tail is not None:
                row_data["ER"] = er_tail
            if r_tail is not None:
                row_data["R"] = r_tail
        elif row_data.get("ERA") is not None and float(row_data["ERA"]) > 20:
            era_tail = _safe_float(cells[-1].get_text(strip=True))
            er_tail = _safe_int(cells[-2].get_text(strip=True))
            if era_tail is not None and era_tail <= 15:
                row_data["ERA"] = era_tail
                if er_tail is not None:
                    row_data["ER"] = er_tail

    if len(cells) > 1:
        row_team = (cells[1].get_text() or "").strip()
        if row_team and "球団" not in row_team:
            mapped = TEAM_LEAGUE_MAP.get(row_team.replace(" ", "").replace("\u3000", ""))
            if mapped:
                row_data["team"] = mapped[1]
            elif row_team:
                row_data["team"] = row_team

    return row_data


def parse_pitching_from_html(
    html: str,
    player_id: str,
    player_name_ja: str,
    years: Set[int],
    default_league: str = "",
    default_team: str = "",
) -> Dict[int, Dict[str, Any]]:
    if not years:
        return {}
    soup = BeautifulSoup(html, "lxml")
    page_team = default_team or find_team_on_page(html)
    page_league = default_league or league_for_team(page_team)
    formal_team = TEAM_LEAGUE_MAP.get(page_team, (page_league, page_team))[1] if page_team else page_team
    out: Dict[int, Dict[str, Any]] = {}

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_cells = rows[0].find_all(["th", "td"])
        header_texts = [c.get_text(strip=True) for c in header_cells]
        header_joined = "".join(header_texts).replace(" ", "")
        if "年度" not in header_joined or "防御率" not in header_joined or "投球回" not in header_joined:
            continue
        if "登板" not in header_joined and "試合" not in header_joined:
            continue

        col_map: Dict[str, int] = {}
        for i, h in enumerate(header_texts):
            h = h.replace(" ", "")
            if "年度" in h:
                col_map["year"] = i
            elif "登板" in h:
                col_map["G"] = i
            elif "勝利" in h:
                col_map["W"] = i
            elif "敗北" in h:
                col_map["L"] = i
            elif "セーブ" in h:
                col_map["SV"] = i
            elif h == "H" and "HP" in header_joined:
                col_map["HOLD"] = i
            elif "HP" in h or h == "ＨＰ":
                col_map["HP"] = i
            elif "完投" in h:
                col_map["CG"] = i
            elif "完封" in h:
                col_map["SHO"] = i
            elif "勝率" in h:
                col_map["WPCT"] = i
            elif "打者" in h:
                col_map["BF"] = i
            elif "投球回" in h:
                col_map["IP"] = i
            elif "安打" in h:
                col_map["H"] = i
            elif "本塁打" in h:
                col_map["HR"] = i
            elif "四球" in h and "故意" not in h:
                col_map["BB"] = i
            elif "死球" in h:
                col_map["HBP"] = i
            elif "三振" in h:
                col_map["SO"] = i
            elif "暴投" in h:
                col_map["WP"] = i
            elif "ボーク" in h:
                col_map["BK"] = i
            elif "失点" in h:
                col_map["R"] = i
            elif "自責" in h:
                col_map["ER"] = i
            elif "防御率" in h:
                col_map["ERA"] = i

        if "year" not in col_map or "G" not in col_map:
            continue

        header_len = len(header_texts)
        for year in years:
            for row in rows[1:]:
                cells = row.find_all(["th", "td"])
                row_team = ""
                if len(cells) > 1:
                    row_team = (cells[1].get_text() or "").strip()
                parsed = _parse_pitching_row(
                    cells,
                    col_map,
                    header_len,
                    year,
                    player_id,
                    player_name_ja,
                    formal_team or page_team or row_team,
                    page_league or default_league,
                )
                if parsed:
                    out[year] = parsed
                    break
    return out


class RomanSkipIndex:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.roster: Dict[str, Dict[str, str]] = {}
        self.master_en: Dict[str, str] = {}
        self.dict_en: Dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        roster_path = self.root / "_data" / "npb_roster_2026.csv"
        if roster_path.is_file():
            with roster_path.open(encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f):
                    pid = (row.get("npb_player_id") or "").strip()
                    if pid:
                        self.roster[pid] = row

        for pattern in ("_data/master_csv/pitching_*_from_master.csv", "_data/master_csv/batting_*_from_master.csv"):
            for path in self.root.glob(pattern):
                try:
                    with path.open(encoding="utf-8-sig", newline="") as f:
                        for row in csv.DictReader(f):
                            pid = (row.get("player_id") or "").strip()
                            en = (row.get("player_name_en") or "").strip()
                            if pid and en and pid not in self.master_en:
                                self.master_en[pid] = en
                except OSError:
                    continue

        dict_path = self.root / "output" / "master" / "player_id_to_roman_full.csv"
        if dict_path.is_file():
            with dict_path.open(encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f):
                    pid = (row.get("player_id") or row.get("npb_player_id") or "").strip()
                    en = (row.get("roman_name") or row.get("name_en") or row.get("player_name_en") or "").strip()
                    if pid and en:
                        self.dict_en[pid] = en

    def check(self, player_id: str, meta_path: Path) -> Tuple[bool, str, str, str]:
        """Returns skipped, reason, existing_full, existing_short"""
        if player_id in self.roster:
            r = self.roster[player_id]
            full = (r.get("name_en_full") or r.get("name_en") or "").strip()
            short = (r.get("name_en_short") or "").strip()
            if full or short:
                return True, "npb_roster_2026.csv", full, short

        if player_id in self.master_en:
            short = self.master_en[player_id]
            return True, "master_csv.player_name_en", short, short

        if player_id in self.dict_en:
            val = self.dict_en[player_id]
            return True, "player_id_to_roman_full.csv", val, val

        if meta_path.is_file():
            try:
                data = json.loads(meta_path.read_text(encoding="utf-8"))
                full = ((data.get("roman") or {}).get("name_en_full") or "").strip()
                if full:
                    short = ((data.get("roman") or {}).get("name_en_short") or "").strip()
                    return True, "npb_player_meta.existing", full, short
            except json.JSONDecodeError:
                pass

        return False, "", "", ""


def build_roman_block(
    html: str,
    player_id: str,
    name_ja: str,
    skip_index: RomanSkipIndex,
    meta_path: Path,
    force_roman: bool = False,
) -> Dict[str, Any]:
    skipped, reason, ex_full, ex_short = skip_index.check(player_id, meta_path)
    if skipped and not force_roman:
        return {
            "name_en_full": ex_full,
            "name_en_short": ex_short or (to_initial_lastname(ex_full, is_japanese_listed_name(name_ja)) if ex_full else ""),
            "source": reason,
            "skipped": True,
        }

    raw = find_roman_name(html) or ""
    is_ja = is_japanese_listed_name(name_ja)
    name_full = raw
    if raw and is_ja and " " in raw:
        parts = raw.split()
        if len(parts) == 2:
            name_full = f"{parts[0]} {parts[1]}"
    short = to_initial_lastname(name_full, is_japanese=is_ja) if name_full else ""
    return {
        "name_en_full": name_full,
        "name_en_short": short,
        "source": "npb_official" if name_full else "",
        "skipped": False,
    }


def parse_unified(
    html: str,
    player_id: str,
    name_ja: str,
    years: Set[int],
    default_league: str,
    skip_index: RomanSkipIndex,
    meta_path: Path,
    skip_pitching: bool = False,
    force_roman: bool = False,
) -> Dict[str, Any]:
    profile = parse_profile_from_html(html)
    roman = build_roman_block(html, player_id, name_ja, skip_index, meta_path, force_roman=force_roman)
    pitching: Dict[str, Any] = {}
    if not skip_pitching and years:
        rows = parse_pitching_from_html(html, player_id, name_ja, years, default_league=default_league)
        pitching = {str(y): rows[y] for y in sorted(rows.keys())}

    return {
        "player_id": player_id,
        "name_ja": name_ja,
        "profile": profile,
        "roman": roman,
        "pitching_rows_by_year": pitching,
    }


PITCHING_CSV_HEADERS = [
    "year", "league", "team", "player_id", "player_name_ja", "player_name_en",
    "G", "IP", "W", "L", "SV", "ERA", "BF", "H", "HR", "BB", "IBB", "HBP", "SO", "ER", "R",
    "HOLD", "HP", "CG", "SHO", "WPCT", "WP", "BK",
]


def append_staging_csv(staging_dir: Path, row: Dict[str, Any], roman_short: str) -> None:
    year = row.get("year")
    league = row.get("league")
    if not year or not league:
        return
    staging_dir.mkdir(parents=True, exist_ok=True)
    path = staging_dir / f"pitching_{year}_{league}_from_master.csv"
    row_out = dict(row)
    if roman_short and not (row_out.get("player_name_en") or "").strip():
        row_out["player_name_en"] = roman_short

    write_header = not path.is_file()
    with path.open("a", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PITCHING_CSV_HEADERS, extrasaction="ignore")
        if write_header:
            w.writeheader()
        w.writerow(row_out)


def load_samples(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("players") or [])


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
