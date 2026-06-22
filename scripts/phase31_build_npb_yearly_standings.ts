import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  isNpbYearlyTeamLabel,
  normalizeNpbYearlyTeam,
} from '../lib/standings/teamCodes.ts';

type RawRow = Record<string, unknown>;

const SOURCE = 'npb_official_yearly' as const;
const LEAGUES = ['CL', 'PL'] as const;

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const yearArg = argValue('--year');
const fromArg = argValue('--from');
const toArg = argValue('--to');

const fromYear = yearArg ? Number(yearArg) : Number(fromArg ?? 1950);
const toYear = yearArg ? Number(yearArg) : Number(toArg ?? 2025);

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s/g, '').trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  let s = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.\-]/g, '')
    .trim();

  if (!s || s === '-' || s === '.') return null;
  if (s.startsWith('.')) s = `0${s}`;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  const s = clean(value);
  return s && s !== '-' ? s : null;
}

function round(value: number | null, digits: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function inningsToOuts(value: unknown): number | null {
  const s = toStringOrNull(value);
  if (!s) return null;

  const cleaned = s.replace(/,/g, '');
  const [wholeRaw, fracRaw = '0'] = cleaned.split('.');
  const whole = Number(wholeRaw);
  const frac = Number(fracRaw);

  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;
  if (![0, 1, 2].includes(frac)) return null;

  return whole * 3 + frac;
}

function outsToInnings(outs: number | null): number | null {
  return outs === null ? null : outs / 3;
}

function displayTeamName(team: string, fallback: string): string {
  if (team === 'Bu') return '近鉄';
  return fallback;
}

function extractTeamLabel(row: RawRow): string | null {
  const direct = clean(row.team);
  if (direct && isNpbYearlyTeamLabel(direct)) return direct;

  for (const value of Object.values(row)) {
    const label = clean(value);
    if (label && isNpbYearlyTeamLabel(label)) return label;
  }

  return null;
}

function teamRows(raw: unknown): RawRow[] {
  const rows = Array.isArray(raw) ? (raw as RawRow[]) : [];
  return rows.filter((row) => !!extractTeamLabel(row));
}

function rowKey(row: RawRow): string | null {
  const label = extractTeamLabel(row);
  if (!label) return null;

  const normalized = normalizeNpbYearlyTeam(label);

  // 同じ現行コードに吸収される歴史球団も区別できるように、npbLabelも混ぜる
  return `${normalized.team}::${normalized.npbLabel}`;
}

function uniqueRows(rows: RawRow[]): RawRow[] {
  const seen = new Set<string>();
  const out: RawRow[] = [];

  for (const row of rows) {
    const key = rowKey(row);
    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(row);
  }

  return out;
}

function isStandingsRow(row: RawRow): boolean {
  // raw の standings はキー名がずれている。
  // g=勝, w=敗, l=分 として判定する。
  const w = toNumber(row.g);
  const l = toNumber(row.w);
  const t = toNumber(row.l) ?? 0;

  if (w === null || l === null) return false;
  if (!Number.isInteger(w) || !Number.isInteger(l) || !Number.isInteger(t)) return false;

  const g = w + l + t;

  if (g < 40 || g > 160) return false;
  if (w < 0 || w > 120) return false;
  if (l < 0 || l > 120) return false;
  if (t < 0 || t > 40) return false;

  // 打撃表は w/ab などが数千になるのでここで落ちる。
  // 投手表は l が敗戦数ではなく勝利数になり、t相当が大きくなりやすいので落ちる。
  return true;
}

function isBattingRow(row: RawRow): boolean {
  const avg = toNumber(row.avg);
  const g = toNumber(row.g);
  const ab = toNumber(row.ab);
  const h = toNumber(row.h);

  if (avg === null || g === null || ab === null || h === null) return false;

  return (
    avg >= 0.15 &&
    avg <= 0.35 &&
    g >= 40 &&
    g <= 160 &&
    ab >= 1000 &&
    ab <= 6000 &&
    h >= 300 &&
    h <= 2000
  );
}

function isPitchingRow(row: RawRow): boolean {
  const era = toNumber(row.era);
  const g = toNumber(row.g);
  const ipOuts = inningsToOuts(row.ip);

  if (era === null || g === null || ipOuts === null) return false;

  const ip = outsToInnings(ipOuts);

  return (
    era >= 1 &&
    era <= 8 &&
    g >= 40 &&
    g <= 200 &&
    ip !== null &&
    ip >= 300 &&
    ip <= 1600
  );
}

function parseStandings(row: RawRow) {
  const label = extractTeamLabel(row);
  if (!label) return null;

  const normalized = normalizeNpbYearlyTeam(label);

  const w = toNumber(row.g);
  const l = toNumber(row.w);
  const t = toNumber(row.l) ?? 0;

  const gRaw = toNumber(row.era);
  const g =
    gRaw !== null
      ? gRaw
      : w !== null && l !== null
        ? w + l + t
        : null;

  const rawPct = toNumber(row.pct);
  const pct =
    rawPct !== null
      ? rawPct
      : w !== null && l !== null && w + l > 0
        ? round(w / (w + l), 3)
        : null;

  const gb =
    toStringOrNull(row.gb) ??
    toStringOrNull(row.sho);

  return {
    key: rowKey(row),
    normalized,
    g,
    w,
    l,
    t,
    pct,
    gb,
  };
}

function parseBatting(row: RawRow) {
  const label = extractTeamLabel(row);
  if (!label) return null;

  const normalized = normalizeNpbYearlyTeam(label);

  return {
    key: rowKey(row),
    normalized,
    avg: toNumber(row.avg),
    battingG: toNumber(row.g),
    ab: toNumber(row.ab),
    runs: toNumber(row.runs),
    h: toNumber(row.h),
    doubles: toNumber(row.doubles),
    triples: toNumber(row.triples),
    hr: toNumber(row.hr),
    rbi: toNumber(row.rbi),
    sb: toNumber(row.sb),
  };
}

function parsePitching(row: RawRow) {
  const label = extractTeamLabel(row);
  if (!label) return null;

  const normalized = normalizeNpbYearlyTeam(label);
  const ipRaw = toStringOrNull(row.ip);
  const ipOuts = inningsToOuts(ipRaw);
  const ip = outsToInnings(ipOuts);

  return {
    key: rowKey(row),
    normalized,
    era: toNumber(row.era),
    pitchingG: toNumber(row.g),
    pitchingW: toNumber(row.w),
    pitchingL: toNumber(row.l),
    sv: toNumber(row.sv),
    cg: toNumber(row.cg),
    sho: toNumber(row.sho),
    ipRaw,
    ip,
    so: toNumber(row.so),
    runsAllowed: toNumber(row.runs_allowed),
  };
}

function mapByKey<T extends { key: string | null }>(
  items: Array<T | null>
): Map<string, T> {
  const map = new Map<string, T>();

  for (const item of items) {
    if (!item?.key) continue;
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  }

  return map;
}

function buildOne(year: number, league: 'CL' | 'PL') {
  const rawPath = join('_data', 'raw', 'npb_yearly', String(year), `${league}.json`);

  if (!existsSync(rawPath)) {
    console.warn(`[skip] raw not found: ${rawPath}`);
    return null;
  }

  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));

  const standingsRows = uniqueRows(teamRows(raw.standings).filter(isStandingsRow));
  const battingRows = uniqueRows(teamRows(raw.batting).filter(isBattingRow));
  const pitchingRows = uniqueRows(teamRows(raw.pitching).filter(isPitchingRow));

  const standings = standingsRows
    .map(parseStandings)
    .filter(Boolean) as NonNullable<ReturnType<typeof parseStandings>>[];

  const battingByKey = mapByKey(battingRows.map(parseBatting));
  const pitchingByKey = mapByKey(pitchingRows.map(parsePitching));

  const rows = standings.map((standing, index) => {
    const team = standing.normalized.team;
    const batting = standing.key ? battingByKey.get(standing.key) : undefined;
    const pitching = standing.key ? pitchingByKey.get(standing.key) : undefined;

    const ab = batting?.ab ?? null;
    const h = batting?.h ?? null;
    const doubles = batting?.doubles ?? null;
    const triples = batting?.triples ?? null;
    const hr = batting?.hr ?? null;
    const avg = batting?.avg ?? null;

    let slg: number | null = null;
    let isop: number | null = null;

    if (
      ab !== null &&
      ab > 0 &&
      h !== null &&
      doubles !== null &&
      triples !== null &&
      hr !== null
    ) {
      const singles = h - doubles - triples - hr;
      const totalBases = singles + doubles * 2 + triples * 3 + hr * 4;
      slg = round(totalBases / ab, 3);
      isop = avg !== null ? round(slg - avg, 3) : null;
    }

    const k9 =
      pitching?.so !== null &&
      pitching?.so !== undefined &&
      pitching?.ip !== null &&
      pitching?.ip !== undefined &&
      pitching.ip > 0
        ? round((pitching.so * 9) / pitching.ip, 2)
        : null;

    return {
      source: SOURCE,
      year,
      league,
      rank: index + 1,

      team,
      teamName: displayTeamName(team, standing.normalized.teamName),
      npbLabel: standing.normalized.npbLabel,

      g: standing.g,
      w: standing.w,
      l: standing.l,
      t: standing.t,
      pct: standing.pct,
      gb: standing.gb,

      runs: batting?.runs ?? null,
      avg,
      ab,
      h,
      doubles,
      triples,
      hr,
      rbi: batting?.rbi ?? null,
      sb: batting?.sb ?? null,
      slg,
      isop,

      runs_allowed: pitching?.runsAllowed ?? null,
      era: pitching?.era ?? null,
      cg: pitching?.cg ?? null,
      sho: pitching?.sho ?? null,
      ip: pitching?.ipRaw ?? null,
      k9,
      so: pitching?.so ?? null,
    };
  });

  const out = {
    source: SOURCE,
    year,
    league,
    rows,
  };

  const outDir = join('public', 'data', 'standings', String(year));
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, `${league}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log(`[ok] ${year} ${league}: ${rows.length} teams -> ${outPath}`);

  return out;
}

let built = 0;
let failed = 0;

for (let year = fromYear; year <= toYear; year++) {
  for (const league of LEAGUES) {
    try {
      const result = buildOne(year, league);
      if (result) built++;
    } catch (error) {
      failed++;
      console.error(`[error] ${year} ${league}`);
      console.error(error);
    }
  }
}

console.log(`done. built=${built} failed=${failed}`);

if (failed > 0) {
  process.exit(1);
}
