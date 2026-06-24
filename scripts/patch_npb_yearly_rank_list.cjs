const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.rank-list-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

const labelsToAdd = [
  '順位',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
];

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

let add = '';

for (const label of labelsToAdd) {
  const pattern = new RegExp(`['"\`]${label}['"\`]`);
  if (!pattern.test(src.slice(start, end))) {
    add += `  '${label}',\n`;
  }
}

if (add) {
  src = src.slice(0, end) + add + src.slice(end);
}

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
