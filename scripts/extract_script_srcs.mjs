import fs from "node:fs"

const p = process.argv[2]
if (!p) {
  console.error("usage: node scripts/extract_script_srcs.mjs <htmlPath>")
  process.exit(1)
}

const html = fs.readFileSync(p, "utf8")
const re = /<script[^>]+src="([^"]+)"/gi
const srcs = new Set()
let m
while ((m = re.exec(html))) srcs.add(m[1])
console.log(JSON.stringify({ htmlPath: p, scripts: [...srcs] }, null, 2))

