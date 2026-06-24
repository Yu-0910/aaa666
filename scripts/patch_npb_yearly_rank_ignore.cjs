const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。プロジェクトルートで実行してください。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.rank-ignore-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

if (!src.includes('function isIgnoredNpbYearlyNonTeamLabel')) {
  const marker = 'const NPB_YEARLY_NON_TEAM_LABELS = new Set([';
  const start = src.indexOf(marker);

  if (start === -1) {
    console.error('ERROR: NPB_YEARLY_NON_TEAM_LABELS が見つかりません。');
    process.exit(1);
  }

  const end = src.indexOf(']);', start);

  if (end === -1) {
    console.error('ERROR: NPB_YEARLY_NON_TEAM_LABELS の終端が見つかりません。');
    process.exit(1);
  }

  const insertAt = end + 3;

  const helper = `

function isIgnoredNpbYearlyNonTeamLabel(label: string): boolean {
  return (
    NPB_YEARLY_NON_TEAM_LABELS.has(label) ||
    label === '順位' ||
    /^\\d+$/.test(label)
  );
}
`;

  src = src.slice(0, insertAt) + helper + src.slice(insertAt);
}

src = src.replace(
  /NPB_YEARLY_NON_TEAM_LABELS\.has\(normalized\)/g,
  'isIgnoredNpbYearlyNonTeamLabel(normalized)'
);

src = src.replace(
  /NPB_YEARLY_NON_TEAM_LABELS\.has\(label\)/g,
  'isIgnoredNpbYearlyNonTeamLabel(label)'
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
