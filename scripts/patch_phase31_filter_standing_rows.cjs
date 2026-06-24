const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.filter-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

if (!src.includes('function isStandingRow')) {
  const marker = 'function rowMapByTeam(rows: RawRow[] | undefined): Map<string, RawRow> {';

  const helper = `
function isStandingRow(row: RawRow): boolean {
  const w = toNumber(pick(row, ['w', '勝', '勝利']));
  const l = toNumber(pick(row, ['l', '敗', '敗北']));
  const pct = toNumber(pick(row, ['pct', '勝率']));
  const gb = toStringOrNull(pick(row, ['gb', '差', 'ゲーム差']));

  // 順位表の行だけ通す。
  // 打撃表・投手表にも球団名は入るが、勝敗・勝率・ゲーム差がないので除外する。
  return w !== null && l !== null && (pct !== null || gb !== null);
}

`;

  if (!src.includes(marker)) {
    console.error('ERROR: 挿入位置が見つかりません。');
    process.exit(1);
  }

  src = src.replace(marker, helper + marker);
}

if (!src.includes('const seenTeams = new Set<string>();')) {
  src = src.replace(
    '  const rows = [];\n\n  for (const rawStanding of standingsRows) {',
    '  const rows = [];\n  const seenTeams = new Set<string>();\n\n  for (const rawStanding of standingsRows) {'
  );
}

if (!src.includes('if (!isStandingRow(rawStanding)) continue;')) {
  src = src.replace(
    '  for (const rawStanding of standingsRows) {\n    const label = extractTeamLabel(rawStanding);',
    '  for (const rawStanding of standingsRows) {\n    if (!isStandingRow(rawStanding)) continue;\n\n    const label = extractTeamLabel(rawStanding);'
  );
}

if (!src.includes('if (seenTeams.has(normalized.team)) continue;')) {
  src = src.replace(
    '    const normalized = normalizeNpbYearlyTeam(label);\n    const batting = battingByTeam.get(normalized.team) ?? {};',
    '    const normalized = normalizeNpbYearlyTeam(label);\n    if (seenTeams.has(normalized.team)) continue;\n    seenTeams.add(normalized.team);\n\n    const batting = battingByTeam.get(normalized.team) ?? {};'
  );
}

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
