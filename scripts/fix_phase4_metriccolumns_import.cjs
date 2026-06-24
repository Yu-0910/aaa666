const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'app', 'components', 'top', 'TopPageStandingsTab.tsx');

if (!fs.existsSync(target)) {
  console.error('ERROR: TopPageStandingsTab.tsx が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.fix-import-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

src = src.replace(
  /import\s*\{\s*STANDINGS_METRIC_COLUMNS\s*,?\s*standingsMetricColumnsForSource\s*,?\s*\}\s*from\s*["']@\/lib\/standings\/metricColumns["']/s,
  'import { STANDINGS_METRIC_COLUMNS, standingsMetricColumnsForSource } from "@/lib/standings/metricColumns"'
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
