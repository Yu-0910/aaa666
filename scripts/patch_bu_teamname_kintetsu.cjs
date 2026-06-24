const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.bu-name-fix-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

// もし Bu: 'オリックス' のような誤った表示名があれば Bu: '近鉄' に直す
src = src.replace(
  /(['"]?Bu['"]?\s*:\s*)['"]オリックス['"]/g,
  "$1'近鉄'"
);

// normalizeNpbYearlyTeam の戻り値で teamName が normalized される場合の保険。
// 生成JSON上で Bu は必ず近鉄表示になるように、teamName 代入直前を補正する。
if (!src.includes("const teamName = team === 'Bu' ? '近鉄'")) {
  src = src.replace(
    /(export function normalizeNpbYearlyTeam[\s\S]*?const team = [^;]+;\s*)/,
    `$1\n  const teamName = team === 'Bu' ? '近鉄' : undefined;\n`
  );

  src = src.replace(
    /teamName:\s*([^,\n}]+)/,
    "teamName: teamName ?? $1"
  );
}

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
