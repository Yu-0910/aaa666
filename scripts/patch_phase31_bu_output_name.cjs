const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.bu-output-name-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

src = src.replace(
  /teamName:\s*normalized\.teamName,/g,
  "teamName: normalized.team === 'Bu' ? '近鉄' : normalized.teamName,"
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
