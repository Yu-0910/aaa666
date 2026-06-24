const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'scripts', 'phase31_build_npb_yearly_standings.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: scripts/phase31_build_npb_yearly_standings.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.g-fallback-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

src = src.replace(
  /const g = toNumber\(row\.era\);/,
  `const gRaw = toNumber(row.era);
  const g =
    gRaw !== null
      ? gRaw
      : w !== null && l !== null
        ? w + l + (t ?? 0)
        : null;`
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
