import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  auditNpbYearlyTeamLabels,
  normalizeNpbYearlyTeam,
} from '../lib/standings/teamCodes.ts';

const labels: string[] = [];

for (const y of readdirSync('_data/raw/npb_yearly')) {
  for (const lg of ['CL', 'PL'] as const) {
    try {
      const j = JSON.parse(
        readFileSync(join('_data/raw/npb_yearly', y, `${lg}.json`), 'utf8')
      );

      for (const s of ['standings', 'batting', 'pitching'] as const) {
        for (const r of j[s] ?? []) {
          if (r?.team) labels.push(r.team);
        }
      }
    } catch {
      // ファイルがない年度・リーグは無視
    }
  }
}

const a = auditNpbYearlyTeamLabels(labels);

console.log(
  'mapped',
  a.mapped.length,
  'unmapped',
  a.unmapped.length,
  'ignored',
  a.ignored?.length ?? 0
);

if (a.unmapped.length) {
  console.log(a.unmapped);
  process.exit(1);
}

console.log(normalizeNpbYearlyTeam('横浜大洋ホエールズ'));
console.log('Phase 2 OK');
