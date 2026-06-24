const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'app', 'components', 'top', 'TopPageStandingsTab.tsx');

if (!fs.existsSync(target)) {
  console.error('ERROR: app/components/top/TopPageStandingsTab.tsx が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.phase4-columns-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

// metricColumns import に standingsMetricColumnsForSource を追加
if (!src.includes('standingsMetricColumnsForSource')) {
  src = src.replace(
    /(STANDINGS_METRIC_COLUMNS\s*,?)/,
    `$1
  standingsMetricColumnsForSource,`
  );
}

// JSX内の STANDINGS_METRIC_COLUMNS.map を source別列定義に変更
src = src.replace(
  /STANDINGS_METRIC_COLUMNS\.map\(\(col\) => \{/g,
  `standingsMetricColumnsForSource((rows[0]?.source ?? "canonical") as any).map((col) => {`
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
