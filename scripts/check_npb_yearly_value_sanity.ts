import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const bad: string[] = [];

for (const year of readdirSync('public/data/standings')) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1950 || y > 2025) continue;

  for (const league of ['CL', 'PL'] as const) {
    const path = join('public/data/standings', year, `${league}.json`);
    const j = JSON.parse(readFileSync(path, 'utf8'));

    for (const row of j.rows ?? []) {
      if (row.g === null) {
        bad.push(`${year} ${league} ${row.team}: g=null`);
      }

      if (row.g !== null && (row.g < 40 || row.g > 160)) {
        bad.push(`${year} ${league} ${row.team}: g=${row.g}`);
      }

      if (row.w !== null && row.l !== null && row.t !== null && row.g !== null) {
        const sum = row.w + row.l + row.t;
        if (sum !== row.g) {
          bad.push(`${year} ${league} ${row.team}: g=${row.g}, w+l+t=${sum}`);
        }
      }

      if (row.avg !== null && (row.avg < 0.15 || row.avg > 0.35)) {
        bad.push(`${year} ${league} ${row.team}: avg=${row.avg}`);
      }

      if (row.slg !== null && (row.slg < 0.2 || row.slg > 0.7)) {
        bad.push(`${year} ${league} ${row.team}: slg=${row.slg}`);
      }

      if (row.era !== null && (row.era < 1 || row.era > 8)) {
        bad.push(`${year} ${league} ${row.team}: era=${row.era}`);
      }

      if (row.k9 !== null && (row.k9 < 1 || row.k9 > 12)) {
        bad.push(`${year} ${league} ${row.team}: k9=${row.k9}`);
      }
    }
  }
}

if (bad.length) {
  console.log('value check needed:');
  console.log(bad.slice(0, 200).join('\n'));
  console.log(`total bad = ${bad.length}`);
  process.exit(1);
}

console.log('value sanity check OK');
