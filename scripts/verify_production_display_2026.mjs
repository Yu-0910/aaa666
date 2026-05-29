#!/usr/bin/env node
/**
 * R2 と本番サイトの 2026 表示経路を一括検証
 *
 * 用法:
 *   set RANKINGS_BASE_URL=https://pub-....r2.dev
 *   set DISPLAY_R2_SITE_BASE_URL=https://aaa666-ttd4.vercel.app
 *   npm run display:r2:verify:production
 */

const R2_BASE = process.env.RANKINGS_BASE_URL?.replace(/\/+$/, '')
const SITE_BASE = (
  process.env.DISPLAY_R2_SITE_BASE_URL ||
  process.env.PHASE0_SITE_BASE_URL ||
  ''
).replace(/\/+$/, '')

const CHECKS = [
  {
    label: 'R2 2026 OPS (CL)',
    url: () => `${R2_BASE}/data/rankings/2026/CL/OPS.json`,
    expectHrMax: 20,
  },
  {
    label: 'R2 2025 OPS (PL) — 比較用',
    url: () => `${R2_BASE}/data/rankings/2025/PL/OPS.json`,
    expectHrMin: 25,
  },
  {
    label: 'R2 top-leaders 2026 batting',
    url: () => `${R2_BASE}/data/top-leaders/2026/CL/batting.json`,
  },
  {
    label: '本番 /data プロキシ 2026',
    url: () => `${SITE_BASE}/data/rankings/2026/CL/OPS.json`,
    needsSite: true,
  },
  {
    label: '本番 API leaders 2026',
    url: () => `${SITE_BASE}/api/leaders/2026/CL`,
    needsSite: true,
    parseLeaders: true,
  },
]

async function probe(label, url, opts = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    let detail = `HTTP ${res.status}`
    if (res.ok) {
      const raw = await res.json()
      if (Array.isArray(raw) && raw[0]) {
        const hr = raw[0].hr
        const ops = raw[0].ops
        const name = raw[0].player ?? raw[0].name
        detail += ` | 1位 ${name} OPS=${ops} HR=${hr}`
        if (opts.expectHrMax != null && hr > opts.expectHrMax) {
          detail += ` ⚠ 本塁打が多すぎ（2025データの疑い）`
        }
        if (opts.expectHrMin != null && hr < opts.expectHrMin) {
          detail += ` (2025比較: HRが想定より少ない)`
        }
      } else if (opts.parseLeaders && raw?.leaders?.OPS?.[0]) {
        const top = raw.leaders.OPS[0]
        detail += ` | OPS1位 ${top.name} value=${top.value}`
        if (raw.error) detail += ` ERROR: ${raw.error}`
      } else if (raw?.error) {
        detail += ` | error: ${raw.error}`
      }
    }
    console.log(`${label}\n  ${url}\n  → ${detail}\n`)
    return res.ok
  } catch (e) {
    console.log(`${label}\n  ${url}\n  → FAIL: ${e.message || e}\n`)
    return false
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  console.log('=== 2026 表示経路 検証 ===\n')
  if (!R2_BASE) {
    console.error('RANKINGS_BASE_URL を設定してください')
    process.exit(1)
  }
  if (!SITE_BASE) {
    console.warn('DISPLAY_R2_SITE_BASE_URL 未設定 — R2 のみ検証します\n')
  }

  let ok = 0
  for (const c of CHECKS) {
    if (c.needsSite && !SITE_BASE) continue
    const url = c.url()
    if (await probe(c.label, url, c)) ok++
  }

  console.log('--- 判定 ---')
  console.log(
    '2026 が 2025 に見える典型原因:\n' +
      '  1) Vercel Production に RANKINGS_BASE_URL / NEXT_PUBLIC_RANKINGS_BASE_URL が無い\n' +
      '  2) R2 に 2026 が無い（upload:2026 未実行）\n' +
      '  3) 古いデプロイが 2026→2025 フォールバックしている\n' +
      '  4) 本番 API が壊れている（/api/diag/display-data で確認）\n'
  )
  process.exit(ok >= 2 ? 0 : 1)
}

main()
