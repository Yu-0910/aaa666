import { readFileSync } from 'fs';

const j = JSON.parse(readFileSync('_data/raw/npb_yearly/1990/PL.json', 'utf8'));

for (const section of ['standings', 'batting', 'pitching'] as const) {
  const rows = j[section] ?? [];
  console.log(`\n===== ${section} length=${rows.length} =====`);

  for (const i of [0, 1, 5, 6, 7, 11, 12, 13, 17]) {
    const row = rows[i];
    if (!row) continue;

    console.log(`\n--- ${section}[${i}] ---`);
    console.log(JSON.stringify(row, null, 2));
  }
}
