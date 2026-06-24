const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.parse-standings-final-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

const start = src.indexOf('function parseStandings(row: RawRow)');
const end = src.indexOf('function parseBatting(row: RawRow)', start);

if (start === -1 || end === -1) {
  console.error('ERROR: parseStandings / parseBatting の位置を特定できません。');
  process.exit(1);
}

const replacement = `function parseStandings(row: RawRow) {
  const label = extractTeamLabel(row);
  if (!label) return null;

  const normalized = normalizeNpbYearlyTeam(label);

  // raw の standings はキー名がずれている年度がある。
  // 基本: g=勝, w=敗, l=分
  // 試合数は era 側に入る場合もあるが、なければ 勝+敗+分 で計算する。
  const w = toNumber(row.g);
  const l = toNumber(row.w);
  const t = toNumber(row.l);

  const gRaw = toNumber(row.era);
  const g =
    gRaw !== null
      ? gRaw
      : w !== null && l !== null
        ? w + l + (t ?? 0)
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
    normalized,
    g,
    w,
    l,
    t,
    pct,
    gb,
  };
}

`;

src = src.slice(0, start) + replacement + src.slice(end);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
