const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.kintetsu-safe-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

const kintetsuLabels = [
  '近鉄パールス',
  '近鉄バファロー',
  '近鉄バファローズ',
  '大阪近鉄バファローズ',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function hasKeyMapping(source, label) {
  const re = new RegExp(`['"\`]${escapeRegExp(label)}['"\`]\\s*:`);
  return re.test(source);
}

function replaceKeyMappingValue(source, label, code) {
  const re = new RegExp(
    `(['"\`]${escapeRegExp(label)}['"\`]\\s*:\\s*)['"\`][^'"\`]+['"\`]`,
    'g'
  );
  return source.replace(re, `$1'${code}'`);
}

function insertMissingLabelMappings(source) {
  const name = 'NPB_YEARLY_LABEL_TO_CODE';
  const nameIndex = source.indexOf(name);
  if (nameIndex === -1) throw new Error('NPB_YEARLY_LABEL_TO_CODE が見つかりません。');

  const eqIndex = source.indexOf('=', nameIndex);
  const openIndex = source.indexOf('{', eqIndex);
  const closeIndex = findMatching(source, openIndex, '{', '}');

  if (eqIndex === -1 || openIndex === -1 || closeIndex === -1) {
    throw new Error('NPB_YEARLY_LABEL_TO_CODE の範囲を特定できません。');
  }

  let add = '';

  for (const label of kintetsuLabels) {
    if (!hasKeyMapping(source, label)) {
      add += `  '${label}': 'Bu',\n`;
    }
  }

  if (!add) return source;

  return source.slice(0, closeIndex) + '\n' + add + source.slice(closeIndex);
}

// 近鉄ラベルの値を Bu にする
for (const label of kintetsuLabels) {
  src = replaceKeyMappingValue(src, label, 'Bu');
}
src = insertMissingLabelMappings(src);

// 「コード => 表示名」マップがある場合だけ、Bs: 'オリックス' の直後に Bu: '近鉄' を足す
if (!/(^|\n)\s*['"]?Bu['"]?\s*:\s*['"]近鉄['"]/.test(src)) {
  const bsNamePattern = /((?:^|\n)\s*['"]?Bs['"]?\s*:\s*['"]オリックス['"]\s*,?)/;
  if (bsNamePattern.test(src)) {
    src = src.replace(bsNamePattern, `$1\n  Bu: '近鉄',`);
  }
}

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
