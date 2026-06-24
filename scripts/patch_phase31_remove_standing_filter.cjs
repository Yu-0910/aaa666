const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.remove-standing-filter-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

src = src.replace(
  /\n\s*if \(!isStandingRow\(rawStanding\)\) continue;\n/g,
  '\n'
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
