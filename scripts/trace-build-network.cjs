const fs = require("fs")
const path = require("path")
const http = require("http")
const https = require("https")

const logPath = path.join(process.cwd(), "_reports", "build_network_trace.log")
fs.mkdirSync(path.dirname(logPath), { recursive: true })

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`
  fs.appendFileSync(logPath, msg, "utf8")
  process.stderr.write(msg)
}

function toUrl(input, options) {
  try {
    if (typeof input === "string") return input
    if (input instanceof URL) return input.toString()
    if (input && typeof input === "object") {
      if (input.href) return input.href
      const protocol = input.protocol || options?.protocol || ""
      const hostname = input.hostname || input.host || options?.hostname || options?.host || ""
      const pathname = input.path || input.pathname || options?.path || options?.pathname || ""
      if (hostname) return `${protocol}//${hostname}${pathname}`
      return JSON.stringify(input)
    }
    return String(input)
  } catch {
    return "[unknown-url]"
  }
}

const origFetch = global.fetch
if (origFetch) {
  global.fetch = async function tracedFetch(input, init) {
    log(`fetch ${toUrl(input, init)}`)
    return origFetch.apply(this, arguments)
  }
}

function patchRequest(mod, name) {
  const origRequest = mod.request
  const origGet = mod.get

  mod.request = function tracedRequest(input, options, cb) {
    log(`${name}.request ${toUrl(input, options)}`)
    return origRequest.apply(this, arguments)
  }

  mod.get = function tracedGet(input, options, cb) {
    log(`${name}.get ${toUrl(input, options)}`)
    return origGet.apply(this, arguments)
  }
}

patchRequest(http, "http")
patchRequest(https, "https")

log("build network tracer loaded")
