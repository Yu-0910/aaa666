const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'app', 'components', 'top', 'TopPageStandingsTab.tsx');

if (!fs.existsSync(target)) {
  console.error('ERROR: TopPageStandingsTab.tsx が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.fix-metric-columns-runtime-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

// metricsBlockWidth の直前に、source別の列定義を作る
if (!src.includes('const metricColumns = standingsMetricColumnsForSource')) {
  src = src.replace(
    /(\s*)const metricsBlockWidth = STANDINGS_METRIC_COLUMNS\.reduce\(/,
    `$1const metricColumns = standingsMetricColumnsForSource((rows[0]?.source ?? "canonical") as any)\n$1const metricsBlockWidth = metricColumns.reduce(`
  );
}

// すでに挿入済みの場合も含め、残りの STANDINGS_METRIC_COLUMNS を metricColumns に置換
src = src.replace(/STANDINGS_METRIC_COLUMNS\.reduce\(/g, 'metricColumns.reduce(');
src = src.replace(/STANDINGS_METRIC_COLUMNS\.map\(/g, 'metricColumns.map(');

// 前回の長い式も metricColumns.map に統一
src = src.replace(
  /standingsMetricColumnsForSource\(\(rows\[0\]\?\.source \?\? "canonical"\) as any\)\.map\(/g,
  'metricColumns.map('
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
