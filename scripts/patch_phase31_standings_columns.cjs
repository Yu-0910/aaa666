const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.standings-columns-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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

  // raw の standings はキー名が投手表由来にずれている。
  // era = 試合, g = 勝, w = 敗, l = 分 として読む。
  const g = toNumber(row.era);
  const w = toNumber(row.g);
  const l = toNumber(row.w);
  const t = toNumber(row.l);

  const rawPct = toNumber(row.pct);
  const pct =
    rawPct !== null
      ? rawPct
      : w !== null && l !== null && w + l > 0
        ? round(w / (w + l), 3)
        : null;

  // ゲーム差は年度によって gb / sho 側に入ることがある。
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
