#!/usr/bin/env node
/**
 * debug_pitches JSON から zone_stats を再集計して上書きする
 * 使い方: node scripts/reaggregate_from_debug.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dataDir = path.join(root, '_data', 'yahoo_games_pilot')
const gameId = '2021040084'
const pitcherId = '2103788'

function isSettlementResult(r) {
  const s = (r || '').trim()
  if (/^(左飛|中飛|右飛|二飛|一飛|レフトフライ|センターフライ|ライトフライ|フライ)$/.test(s)) return true
  if (/邪飛|ゴロ|ライナー|併殺/.test(s)) return true
  if (/^(空振り|見逃し)/.test(s)) return true
  if (/三振|空三振|見三振/.test(s)) return true
  if (/安打|ヒット|二塁打|三塁打|本塁打/.test(s)) return true
  if (/^(左安|右安|中安)/.test(s)) return true
  if (/^(左２|右２|中２|左３|右３|中３)/.test(s)) return true
  return false
}

function isHit(r) {
  const s = (r || '').trim()
  return /^(左安|右安|中安|左２|右２|中２|二塁|三塁|本塁|ソロ|満塁)/.test(s) ||
    /安打|ヒット|二塁打|三塁打|本塁打/.test(s)
}

function getTotalBases(r) {
  const s = (r || '').trim()
  if (/本塁打|ホームラン|HR/i.test(s)) return 4
  if (/三塁打/.test(s) || /^(左３|右３|中３)/.test(s)) return 3
  if (/二塁打/.test(s) || /^(左２|右２|中２)/.test(s)) return 2
  if (isHit(s)) return 1
  return 0
}

function isWalk(r) {
  return /四球|敬遠|故意四球/.test((r || '').trim())
}

function isHbp(r) {
  return (r || '').includes('死球')
}

function isSf(r) {
  return (r || '').includes('犠飛')
}

function isHomeRun(r) {
  return /本塁打|ホームラン|HR/i.test((r || '').trim())
}

function nameVariants(name) {
  const n = (name || '').trim().replace(/　/g, ' ').replace(/髙/g, '高')
  if (!n) return []
  const noSpace = n.replace(/\s+/g, '')
  return noSpace !== n ? [n, noSpace] : [n]
}

/** 名簿側: 外国人選手は「Ｃ．ディベイニー」「ディベイニー」の両方で拾えるようにする */
function rosterNameVariants(name) {
  const variants = nameVariants(name)
  const n = (name || '').trim().replace(/　/g, ' ').replace(/髙/g, '高')
  if (!n) return variants
  const m = n.match(/^[Ａ-Ｚa-zA-Z][．.]\s*(.+)$/)
  if (m) {
    const suffix = m[1].trim()
    if (suffix && !variants.includes(suffix)) variants.push(suffix)
  }
  return variants
}

function loadRoster(root) {
  const p = path.join(root, '_data', 'npb_roster_2026.csv')
  if (!fs.existsSync(p)) return {}
  const text = fs.readFileSync(p, 'utf-8')
  const lines = text.split('\n')
  const headers = lines[0].split(',')
  const nameIdx = headers.findIndex(h => h.includes('name_ja'))
  const batIdx = headers.findIndex(h => h.includes('bat_hand'))
  if (nameIdx < 0 || batIdx < 0) return {}
  const lookup = {}
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',')
    const name = (row[nameIdx] || '').trim()
    const bat = (row[batIdx] || '').trim().toUpperCase()
    if (!name || !bat) continue
    const val = bat === 'L' ? '左' : bat === 'R' ? '右' : bat === 'B' ? '両' : ''
    if (val) {
      for (const v of rosterNameVariants(name)) lookup[v] = val
    }
  }
  return lookup
}

function resolveBatterHand(batterHand, batterName, roster) {
  const hand = (batterHand || '').trim()
  if (['左', '右', '両'].includes(hand)) return hand
  if (!roster || !(batterName || '').trim()) return ''
  for (const v of nameVariants(batterName)) {
    const h = roster[v]
    if (h) return h
  }
  return ''
}

function aggregate(allPitches, pitcherId, roster) {
  const pitchCount = { vsRight: {}, vsLeft: {} }
  const byZone = { vsRight: {}, vsLeft: {} }

  const paBlocks = {}
  for (const p of allPitches) {
    if (p.pitcher_id !== pitcherId) continue
    const key = `${p.inning}-${p.top_bottom}-${p.bat_order}`
    if (!paBlocks[key]) paBlocks[key] = []
    paBlocks[key].push(p)
  }

  for (const key of Object.keys(paBlocks)) {
    const pitches = paBlocks[key]
    if (!pitches.length) continue

    const hand = resolveBatterHand(
      pitches[0].batter_hand,
      pitches[0].batter_name,
      roster
    )
    const hands = hand === '両' ? ['vsRight', 'vsLeft'] : hand === '右' ? ['vsRight'] : hand === '左' ? ['vsLeft'] : ['vsRight']

    for (const p of pitches) {
      const zid = parseInt(p.zone_id || 0, 10)
      if (zid >= 1 && zid <= 25) {
        for (const h of hands) {
          pitchCount[h][zid] = (pitchCount[h][zid] || 0) + 1
        }
      }
    }

    const sorted = [...pitches].sort((a, b) => parseInt(a.pitch_no || 0, 10) - parseInt(b.pitch_no || 0, 10))
    const last = sorted[sorted.length - 1]
    const result = (last.result || '').trim()

    let zid = parseInt(last.zone_id || 0, 10)
    if (zid < 1 || zid > 25) {
      for (let i = sorted.length - 2; i >= 0; i--) {
        const z = parseInt(sorted[i].zone_id || 0, 10)
        if (z >= 1 && z <= 25) {
          zid = z
          break
        }
      }
    }
    if (zid < 1 || zid > 25) continue

    const isSettle = isSettlementResult(result) || isWalk(result) || isHbp(result) || isSf(result)
    if (!isSettle) continue

    for (const h of hands) {
      if (!byZone[h][zid]) byZone[h][zid] = { ab: 0, h: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0 }
      const rec = byZone[h][zid]
      if (isWalk(result)) rec.bb++
      else if (isHbp(result)) rec.hbp++
      else if (isSf(result)) rec.sf++
      else if (isSettlementResult(result)) {
        rec.ab++
        if (isHit(result)) {
          rec.h++
          rec.tb += getTotalBases(result)
          if (isHomeRun(result)) rec.hr++
        }
      }
    }
  }

  const result = { vsRight: [], vsLeft: [] }
  for (const hand of ['vsRight', 'vsLeft']) {
    for (let z = 1; z <= 25; z++) {
      const pitches = pitchCount[hand][z] || 0
      const rec = byZone[hand][z] || { ab: 0, h: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0 }
      const { ab, h, hr, tb, bb, hbp, sf } = rec
      const avg = ab > 0 ? (h / ab).toFixed(3) : '—'
      const pa = ab + bb + hbp + sf
      const obp = pa > 0 ? (h + bb + hbp) / pa : 0
      const slg = ab > 0 ? tb / ab : 0
      const ops = pa > 0 ? (obp + slg).toFixed(3) : '—'
      result[hand].push({ zoneId: z, pitches, ab, h, hr, ops, avg })
    }
  }
  return result
}

// main
const debugPath = path.join(dataDir, `debug_pitches_${gameId}_${pitcherId}.json`)
if (!fs.existsSync(debugPath)) {
  console.error('❌ debug_pitches が見つかりません:', debugPath)
  process.exit(1)
}

const allPitches = JSON.parse(fs.readFileSync(debugPath, 'utf-8'))
console.log('📂 debug_pitches 読み込み:', allPitches.length, '投球')

// 決着球の診断
const paBlocks = {}
for (const p of allPitches) {
  if (p.pitcher_id !== pitcherId) continue
  const key = `${p.inning}-${p.top_bottom}-${p.bat_order}`
  if (!paBlocks[key]) paBlocks[key] = []
  paBlocks[key].push(p)
}

console.log('\n[診断] 決着球の結果:')
const keys = Object.keys(paBlocks).sort((a, b) => {
  const [ia, ta, ba] = a.split('-')
  const [ib, tb, bb] = b.split('-')
  if (ia !== ib) return parseInt(ia, 10) - parseInt(ib, 10)
  if (ta !== tb) return ta === '表' ? -1 : 1
  return parseInt(ba, 10) - parseInt(bb, 10)
})
for (const key of keys) {
  const [inning, topBottom, batOrder] = key.split('-')
  const pitches = paBlocks[key]
  const sorted = [...pitches].sort((a, b) => parseInt(a.pitch_no || 0, 10) - parseInt(b.pitch_no || 0, 10))
  const last = sorted[sorted.length - 1]
  const result = (last.result || '').trim()
  const zid = last.zone_id || '?'
  const isH = isHit(result)
  const isSettle = isSettlementResult(result)
  const status = isH ? 'HIT' : (isSettle ? 'SETTLE' : 'skip')
  console.log(`  ${inning}${topBottom} ${batOrder}番: result=${result.slice(0, 35)}... zone=${zid} -> ${status}`)
}

const roster = loadRoster(root)
const aggregated = aggregate(allPitches, pitcherId, roster)

const outData = { game_id: gameId, pitcher_id: pitcherId, vsRight: aggregated.vsRight, vsLeft: aggregated.vsLeft }
const outPath = path.join(dataDir, `zone_stats_${gameId}_${pitcherId}.json`)
fs.writeFileSync(outPath, JSON.stringify(outData, null, 2), 'utf-8')

console.log('\n✅ zone_stats 更新完了:', outPath)
const hitZones = [...aggregated.vsRight, ...aggregated.vsLeft].filter(z => z.h > 0)
console.log('安打ありゾーン:', hitZones.map(z => `zone${z.zoneId}: h=${z.h} avg=${z.avg}`).join(', '))
