import assert from "node:assert/strict"
import sitemap from "@/app/sitemap"

const urls = sitemap().map((item) => item.url)

assert(urls.includes("https://short-stop.jp/players/teruaki-sato"))
assert(urls.includes("https://short-stop.jp/players/teruaki-sato/pitch"))
assert(urls.includes("https://short-stop.jp/players/teruaki-sato/situation"))
assert(urls.includes("https://short-stop.jp/players/teruaki-sato/matchup"))
assert(urls.includes("https://short-stop.jp/players/teruaki-sato/vs-team"))

assert(urls.includes("https://short-stop.jp/players/seiya-hashimoto/catcher"))

assert(!urls.includes("https://short-stop.jp/players/teruaki-sato/advanced"))
assert(!urls.includes("https://short-stop.jp/players/teruaki-sato/splits"))
assert(!urls.includes("https://short-stop.jp/players/teruaki-sato/game-log"))
assert(!urls.includes("https://short-stop.jp/players/hiroto-takahashi/vs-team"))

console.log("validate_player_page_tab_urls_phase6: ok")
