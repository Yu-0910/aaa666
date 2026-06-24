const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。プロジェクトルートで実行してください。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.safe-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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

  ['日拓ホーム・フライヤーズ', 'F'],
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasLabel(source, label) {
  return new RegExp(`['"\`]${escapeRegExp(label)}['"\`]\\s*:`).test(source);
}

function findMatching(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findObjectCloseAfterEquals(source, name) {
  const nameIndex = source.indexOf(name);
  if (nameIndex === -1) throw new Error(`${name} が見つかりません。`);

  const eqIndex = source.indexOf('=', nameIndex);
  const openIndex = source.indexOf('{', eqIndex);
  const closeIndex = findMatching(source, openIndex, '{', '}');

  if (eqIndex === -1 || openIndex === -1 || closeIndex === -1) {
    throw new Error(`${name} のオブジェクト範囲を特定できません。`);
  }

  return closeIndex;
}

function insertMappings(source) {
  const closeIndex = findObjectCloseAfterEquals(source, 'NPB_YEARLY_LABEL_TO_CODE');

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

  if (insertAt === -1) {
    throw new Error('export function isNpbYearlyTeamLabel が見つかりません。');
  }

  return source.slice(0, insertAt) + setCode + source.slice(insertAt);
}

function findFunctionBodyOpen(source, functionName) {
  const start = source.indexOf(`export function ${functionName}`);
  if (start === -1) throw new Error(`${functionName} が見つかりません。`);

  const parenOpen = source.indexOf('(', start);
  const parenClose = findMatching(source, parenOpen, '(', ')');

  if (parenOpen === -1 || parenClose === -1) {
    throw new Error(`${functionName} の引数範囲を特定できません。`);
  }

  let i = parenClose + 1;

  while (i < source.length) {
    const brace = source.indexOf('{', i);
    if (brace === -1) break;

    const between = source.slice(parenClose + 1, brace).trim();

    // 戻り値型が `: { ... }` の場合、その `{ ... }` は関数本体ではないので飛ばす
    if (between === ':') {
      const typeClose = findMatching(source, brace, '{', '}');
      if (typeClose === -1) throw new Error(`${functionName} の戻り値型を解析できません。`);
      i = typeClose + 1;
      continue;
    }

    return brace;
  }

  throw new Error(`${functionName} の関数本体を特定できません。`);
}

function replaceFunction(source, functionName, newCode) {
  const start = source.indexOf(`export function ${functionName}`);
  const bodyOpen = findFunctionBodyOpen(source, functionName);
  const bodyClose = findMatching(source, bodyOpen, '{', '}');

  if (bodyClose === -1) {
    throw new Error(`${functionName} の関数末尾を特定できません。`);
  }

  return source.slice(0, start) + newCode + source.slice(bodyClose + 1);
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
