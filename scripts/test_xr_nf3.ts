import { formatStat } from '@/lib/formatStat'
import { calculateXRNf3 } from '@/lib/xr'

// 辰己涼介 テストデータ（nf3想定）
const input = {
  ab: 78,
  h: 24,
  doubles: 2,
  triples: 1,
  hr: 1,
  bb: 14,
  ibb: 0,
  hbp: 1,
  sb: 2,
  cs: 5,
  so: 13,
  gidp: 2,
  sf: 0,
  sh: 0,
} as const

const singles = Math.max(0, input.h - input.doubles - input.triples - input.hr)

const xr = calculateXRNf3({
  singles,
  doubles: input.doubles,
  triples: input.triples,
  hr: input.hr,
  bb: input.bb,
  ibb: input.ibb,
  hbp: input.hbp,
  sb: input.sb,
  cs: input.cs,
  ab: input.ab,
  h: input.h,
  so: input.so,
  gidp: input.gidp,
  sf: input.sf,
  sh: input.sh,
})

console.log('singles(1B)=', singles)
console.log('XR(raw)=', xr)
console.log('XR(display)=', formatStat('XR', xr))

