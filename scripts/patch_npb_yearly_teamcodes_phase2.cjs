const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。プロジェクトルートで実行してください。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');
const backup = target + `.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

const mappings = [
  ['クラウンライター・ライオンズ', 'L'],
  ['西鉄クリッパース', 'L'],
  ['太平洋クラブ・ライオンズ', 'L'],
  ['西日本パイレーツ', 'L'],

  ['国鉄スワローズ', 'S'],
  ['サンケイアトムズ', 'S'],

  ['大阪タイガース', 'H'],

  ['大映ユニオンズ', 'M'],
  ['毎日大映オリオンズ', 'M'],

  ['近鉄パールス', 'B'],
];

const nonTeamLabels = [
  '最優秀新人',
  '最優秀選手',
  '最優秀防御率',
  '最多勝利',
  '最多奪三振',
  '最多打点',
  '最多本塁打',
  '最多盗塁',
  '最高勝率',
  '首位打者',
];

function hasLabel(source, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"\`]${escaped}['"\`]\\s*:`).test(source);
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function insertMappings(source) {
  const nameIndex = source.indexOf('NPB_YEARLY_LABEL_TO_CODE');
  if (nameIndex === -1) {
    throw new Error('NPB_YEARLY_LABEL_TO_CODE が見つかりません。');
  }

  const eqIndex = source.indexOf('=', nameIndex);
  const openIndex = source.indexOf('{', eqIndex);
  const closeIndex = findMatchingBrace(source, openIndex);

  if (openIndex === -1 || closeIndex === -1) {
    throw new Error('NPB_YEARLY_LABEL_TO_CODE のオブジェクト範囲を特定できません。');
  }

  let add = '';

  for (const [label, code] of mappings) {
    if (!hasLabel(source, label)) {
      add += `  '${label}': '${code}',\n`;
    }
  }

  if (!add) return source;

  return source.slice(0, closeIndex) + '\n' + add + source.slice(closeIndex);
}

function insertNonTeamSet(source) {
  if (source.includes('NPB_YEARLY_NON_TEAM_LABELS')) return source;

  const setCode = `
const NPB_YEARLY_NON_TEAM_LABELS = new Set([
${nonTeamLabels.map((label) => `  '${label}',`).join('\n')}
]);

`;

  const insertAt = source.indexOf('export function isNpbYearlyTeamLabel');
  if (insertAt !== -1) {
    return source.slice(0, insertAt) + setCode + source.slice(insertAt);
  }

  const fallbackAt = source.indexOf('export function resolveNpbYearlyTeamCode');
  if (fallbackAt !== -1) {
    return source.slice(0, fallbackAt) + setCode + source.slice(fallbackAt);
  }

  throw new Error('isNpbYearlyTeamLabel / resolveNpbYearlyTeamCode が見つかりません。');
}

function replaceFunction(source, functionName, newCode) {
  const start = source.indexOf(`export function ${functionName}`);
  if (start === -1) {
    throw new Error(`${functionName} が見つかりません。`);
  }

  const open = source.indexOf('{', start);
  const close = findMatchingBrace(source, open);

  if (open === -1 || close === -1) {
    throw new Error(`${functionName} の関数範囲を特定できません。`);
  }

  return source.slice(0, start) + newCode + source.slice(close + 1);
}

src = insertMappings(src);
src = insertNonTeamSet(src);

src = replaceFunction(
  src,
  'isNpbYearlyTeamLabel',
`export function isNpbYearlyTeamLabel(label: string): boolean {
  const normalized = label.trim();
  if (!normalized) return false;
  if (NPB_YEARLY_NON_TEAM_LABELS.has(normalized)) return false;
  return resolveNpbYearlyTeamCode(normalized) !== null;
}
`
);

src = replaceFunction(
  src,
  'auditNpbYearlyTeamLabels',
`export function auditNpbYearlyTeamLabels(labels: string[]): {
  mapped: string[];
  unmapped: string[];
  ignored: string[];
} {
  const uniqueLabels = Array.from(
    new Set(labels.map((label) => label.trim()).filter(Boolean))
  );

  const mapped: string[] = [];
  const unmapped: string[] = [];
  const ignored: string[] = [];

  for (const label of uniqueLabels) {
    if (NPB_YEARLY_NON_TEAM_LABELS.has(label)) {
      ignored.push(label);
      continue;
    }

    if (resolveNpbYearlyTeamCode(label)) {
      mapped.push(label);
    } else {
      unmapped.push(label);
    }
  }

  return { mapped, unmapped, ignored };
}
`
);

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
