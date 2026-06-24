import { readFileSync } from 'fs';
import { normalizeNpbYearlyTeam, isNpbYearlyTeamLabel } from '../lib/standings/teamCodes.ts';

const j = JSON.parse(readFileSync('_data/raw/npb_yearly/1990/PL.json', 'utf8'));

for (const s of ['standings', 'batting', 'pitching'] as const) {
  console.log(`--- ${s} ---`);
  for (const r of j[s] ?? []) {
    const label = String(r.team ?? '').trim();
    if (!label || !isNpbYearlyTeamLabel(label)) continue;
    console.log(label, '=>', normalizeNpbYearlyTeam(label));
  }
}
