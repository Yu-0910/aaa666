const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'lib', 'standings', 'teamCodes.ts');

if (!fs.existsSync(target)) {
  console.error('ERROR: lib/standings/teamCodes.ts が見つかりません。');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

const backup = target + `.kintetsu-bu-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backup, src, 'utf8');

const labels = [
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

function replaceMapping(source, label) {
  const re = new RegExp(
    `(['"\`]${escapeRegExp(label)}['"\`]\\s*:\\s*)['"\`][^'"\`]+['"\`]`,
    'g'
  );

  return source.replace(re, `$1'Bu'`);
}

function hasMapping(source, label) {
  const re = new RegExp(`['"\`]${escapeRegExp(label)}['"\`]\\s*:`);
  return re.test(source);
}

function insertMissingMappings(source) {
  const name = 'NPB_YEARLY_LABEL_TO_CODE';
  const nameIndex = source.indexOf(name);

  if (nameIndex === -1) {
    console.error('ERROR: NPB_YEARLY_LABEL_TO_CODE が見つかりません。');
    process.exit(1);
  }

  const eqIndex = source.indexOf('=', nameIndex);
  const openIndex = source.indexOf('{', eqIndex);
  const closeIndex = findMatching(source, openIndex, '{', '}');

  if (eqIndex === -1 || openIndex === -1 || closeIndex === -1) {
    console.error('ERROR: NPB_YEARLY_LABEL_TO_CODE の範囲を特定できません。');
    process.exit(1);
  }

  let add = '';

  for (const label of labels) {
    if (!hasMapping(source, label)) {
      add += `  '${label}': 'Bu',\n`;
    }
  }

  if (!add) return source;

  return source.slice(0, closeIndex) + '\n' + add + source.slice(closeIndex);
}

for (const label of labels) {
  src = replaceMapping(src, label);
}

src = insertMissingMappings(src);

// コード → 表示名のマップがある場合は Bu を追加
const possibleNameMaps = [
  'TEAM_CODE_TO_NAME',
  'TEAM_CODE_TO_SHORT_NAME',
  'NPB_TEAM_CODE_TO_NAME',
  'NPB_YEARLY_CODE_TO_TEAM_NAME',
];

for (const mapName of possibleNameMaps) {
  const idx = src.indexOf(mapName);
  if (idx === -1) continue;

  const eqIndex = src.indexOf('=', idx);
  const openIndex = src.indexOf('{', eqIndex);
  const closeIndex = findMatching(src, openIndex, '{', '}');

  if (eqIndex === -1 || openIndex === -1 || closeIndex === -1) continue;

  const body = src.slice(openIndex, closeIndex);

  if (!body.includes('Bu')) {
    src = src.slice(0, openIndex + 1) + "\n  Bu: '近鉄'," + src.slice(openIndex + 1);
  }
}

// normalizeNpbYearlyTeam 内で teamName が取れない場合に備えた保険
if (!src.includes("team === 'Bu' ? '近鉄'")) {
  src = src.replace(
    /teamName:\s*([^,\n}]+)/,
    "teamName: team === 'Bu' ? '近鉄' : $1"
  );
}

fs.writeFileSync(target, src, 'utf8');

console.log('patched:', target);
console.log('backup:', backup);
