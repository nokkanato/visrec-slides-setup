#!/usr/bin/env node
// Visrec Slides Kit (vsk) — edit Google Slides decks AS YOURSELF, with your own Google login.
// Zero dependencies, Node >= 18, one file. Run `node vsk.mjs help`. Guide for AI agents: KIT_GUIDE.md.
//
// Output: JSON on stdout. Errors: JSON {error, hint} on stderr and a non-zero exit code
// (2 = wrong usage, 1 = Google/runtime problem or `check` found problems).
//
// Files (all under ~/.visrec-slides unless overridden):
//   client.json  Google "Desktop app" OAuth client (also looked for next to this file first)
//   token.json   your saved login (mode 0600, folder 0700). Never printed, never sent anywhere but Google.
// Env overrides: VSK_HOME (folder instead of ~/.visrec-slides), VSK_CLIENT_FILE (client.json path),
//   VSK_TOKEN_FILE (use an existing authorized-user token file READ-ONLY: refreshed tokens stay in
//   memory, login/logout are refused).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const VERSION = '0.1.0'
const UA = `visrec-slides-kit/${VERSION}`
const SLIDES = 'https://slides.googleapis.com/v1/presentations'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
export const SCOPES = 'openid email https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file'
const NEEDED_SCOPES = ['https://www.googleapis.com/auth/presentations', 'https://www.googleapis.com/auth/drive.file']
export const EMU_PER_PT = 12700
const EMU_PER_PX = 9525 // 96 dpi
const MB = 1024 * 1024
const MAX_IMAGE_BYTES = 50 * MB
const MAX_PIXELS = 25_000_000
const MULTIPART_MAX = 5 * MB
export const TEMP_NAME = 'vsk temp import (safe to delete)'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const OFF_TOL = 30000 // EMU (~2.4 pt) slack before an element counts as leaving the slide
const HERE = path.dirname(fileURLToPath(import.meta.url))

// Tunable from tests (no real waiting there).
export const settings = { retryBaseMs: 1000, maxRetries: 3, loginTimeoutMs: 5 * 60_000 }

// ---------- errors + secret scrubbing ----------
export class VskError extends Error {
  constructor(message, hint, { exit = 1, status } = {}) {
    super(message)
    this.hint = hint || ''
    this.exit = exit
    this.status = status
  }
}
const usage = (msg, hint) => new VskError(msg, hint || 'Run `node vsk.mjs help` for usage.', { exit: 2 })

const SECRETS = new Set()
function addSecret(s) { if (typeof s === 'string' && s.length >= 8) SECRETS.add(s) }
function scrubKnown(text) {
  let s = String(text ?? '')
  for (const secret of SECRETS) s = s.split(secret).join('[redacted]')
  return s
}
export function scrub(text) {
  return scrubKnown(text)
    .replace(/ya29\.[\w.\-]+/g, '[redacted]')
    .replace(/1\/\/[\w.\-]{16,}/g, '[redacted]')
    .replace(/GOCSPX-[\w\-]+/g, '[redacted]')
    .replace(/(bearer\s+)[^\s"',]+/gi, '$1[redacted]')
    .replace(/((?:access_token|refresh_token|client_secret|id_token)["']?\s*[=:]\s*["']?)[^\s"'&,}]+/gi, '$1[redacted]')
}

// ---------- args ----------
const BOOL_FLAGS = new Set(['yes', 'help'])
export function parseArgs(argv) {
  const flags = {}
  const rest = []
  let cmd = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h') { (flags.help ||= []).push(true); continue }
    if (a.startsWith('--') && a.length > 2) {
      let name = a.slice(2)
      let val
      const eq = name.indexOf('=')
      if (eq > -1) {
        val = name.slice(eq + 1)
        name = name.slice(0, eq)
        if (BOOL_FLAGS.has(name)) val = !/^(false|0|no)$/i.test(val)
      } else if (BOOL_FLAGS.has(name)) {
        val = true
      } else {
        if (i + 1 >= argv.length) throw usage(`--${name} needs a value.`)
        val = argv[++i]
      }
      ;(flags[name] ||= []).push(val)
    } else if (cmd === null) cmd = a
    else rest.push(a)
  }
  return { cmd, flags, rest }
}

function need(f, k, hint) {
  const v = f[k]
  if (v === undefined || v === '' || v === true) throw usage(`--${k} is required.`, hint)
  return v
}
function optNum(f, k) {
  if (f[k] === undefined) return undefined
  const n = Number(f[k])
  if (f[k] === '' || f[k] === true || !Number.isFinite(n)) throw usage(`--${k} must be a number (got "${f[k]}").`)
  return n
}
function optIndex(f, k) {
  const n = optNum(f, k)
  if (n !== undefined && (!Number.isInteger(n) || n < 0))
    throw usage(`--${k} must be a whole number, 0 or more.`, 'Index is 0-based: slide number 1 = index 0.')
  return n
}
function jsonArg(v, name) {
  let text = String(v)
  if (text.startsWith('@')) {
    const file = text.slice(1)
    try { text = fs.readFileSync(file, 'utf8') } catch { throw usage(`Cannot read the file given to --${name}: ${file}`) }
  }
  try { return JSON.parse(text) } catch (e) {
    throw usage(`--${name} is not valid JSON (${e.message}).`, `Put the JSON in single quotes, or save it to a file and pass --${name} @file.json`)
  }
}
function textArg(f, k, fileKey) {
  if (f[k] !== undefined && f[fileKey] !== undefined) throw usage(`Use --${k} or --${fileKey}, not both.`)
  if (f[fileKey] !== undefined) {
    let t
    try { t = fs.readFileSync(String(f[fileKey]), 'utf8') } catch { throw usage(`Cannot read --${fileKey} ${f[fileKey]}`) }
    return t.replace(/\r\n/g, '\n').replace(/\n$/, '')
  }
  if (f[k] !== undefined) {
    if (f[k] === true) throw usage(`--${k} needs a value.`)
    return String(f[k]).replace(/\r\n/g, '\n')
  }
  return undefined
}

/** Deck id (and optional #slide=id.X) from an id or a docs.google.com / drive.google.com link. */
export function parseDeck(input) {
  const s = String(input ?? '').trim()
  if (!s || s === 'true') throw usage('--deck is required.', 'Pass the deck link (https://docs.google.com/presentation/d/…) or its id.')
  let id = s
  let slide = null
  if (/^https?:\/\//i.test(s)) {
    let u
    try { u = new URL(s) } catch { throw usage(`That link is not valid: ${s.slice(0, 120)}`) }
    const m = u.pathname.match(/\/(?:presentation|file)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/)
    id = m?.[1] || u.searchParams.get('id')
    const h = u.hash.match(/slide=id\.([A-Za-z0-9_:\-]+)/)
    if (h) slide = h[1]
  }
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id))
    throw usage(`That does not look like a Google Slides deck: ${s.slice(0, 120)}`,
      'Pass the full link from the browser address bar (https://docs.google.com/presentation/d/…/edit) or the long id in it.')
  return { id, slide }
}

// ---------- paths, client, token store ----------
const expandHome = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
export function kitHome(env) { return env.VSK_HOME ? expandHome(env.VSK_HOME) : path.join(os.homedir(), '.visrec-slides') }
export function tokenPath(env) { return env.VSK_TOKEN_FILE ? expandHome(env.VSK_TOKEN_FILE) : path.join(kitHome(env), 'token.json') }
const isReadOnly = (env) => Boolean(env.VSK_TOKEN_FILE)
function clientPaths(env) {
  if (env.VSK_CLIENT_FILE) return [expandHome(env.VSK_CLIENT_FILE)]
  return [path.join(HERE, 'client.json'), path.join(kitHome(env), 'client.json')]
}

export function loadClient(env) {
  for (const p of clientPaths(env)) {
    if (!fs.existsSync(p)) continue
    let j
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')) } catch {
      throw new VskError(`The Google sign-in client file is not valid JSON (${p}).`, 'Ask Nok for a fresh copy of the kit.')
    }
    const c = j?.installed
    if (!c?.client_id || !c?.client_secret)
      throw new VskError(`The Google sign-in client file is not a "Desktop app" client (${p}).`,
        'Nok: in Google Cloud Console → Credentials, create an OAuth client of type "Desktop app" and save its JSON ({"installed": …}) as client.json.')
    addSecret(c.client_secret)
    return { clientId: c.client_id, clientSecret: c.client_secret, tokenUri: c.token_uri || TOKEN_URL }
  }
  throw new VskError('No Google sign-in client is set up yet (client.json not found).',
    `Nok has to put the "Desktop app" OAuth client JSON at ${clientPaths(env).join(' or ')}. Ask Nok for the latest kit.`)
}

/** Write the token file atomically: file 0600, folder 0700. */
export function saveToken(file, data) {
  const dir = path.dirname(file)
  const created = !fs.existsSync(dir)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (created || path.basename(dir) === '.visrec-slides') fs.chmodSync(dir, 0o700)
  const tmp = path.join(dir, `.token-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  fs.chmodSync(tmp, 0o600)
  fs.renameSync(tmp, file)
}

/** Google writes expiry as naive UTC ("2026-11-05T07:43:18.859457"); treat a missing zone as UTC. */
export function parseExpiry(s) {
  if (!s) return NaN
  const str = String(s)
  return Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(str) ? str : `${str}Z`)
}

function loadSession(ctx) {
  if (ctx.session) return ctx.session
  const file = tokenPath(ctx.env)
  if (!fs.existsSync(file))
    throw new VskError('You are not logged in yet.', 'Run `node vsk.mjs login` — a browser window opens; sign in with the Google account the deck is shared with.')
  let cred
  try { cred = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {
    throw new VskError('Your saved login is damaged.', 'Run `node vsk.mjs logout`, then `node vsk.mjs login`.')
  }
  for (const k of ['token', 'refresh_token', 'client_secret']) addSecret(cred[k])
  ctx.session = { file, cred, readOnly: isReadOnly(ctx.env) }
  return ctx.session
}

async function refreshToken(ctx) {
  const s = loadSession(ctx)
  const c = s.cred
  if (!c.refresh_token || !c.client_id)
    throw new VskError('Your saved login cannot be renewed.', 'Run `node vsk.mjs login` again.')
  const j = await request(ctx, c.token_uri || TOKEN_URL, {
    method: 'POST', auth: false, what: 'renew login',
    form: { client_id: c.client_id, client_secret: c.client_secret || '', refresh_token: c.refresh_token, grant_type: 'refresh_token' },
  })
  if (!j.access_token) throw new VskError('Google did not renew the login.', 'Run `node vsk.mjs login` again.')
  c.token = j.access_token
  addSecret(c.token)
  c.expiry = new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString()
  if (j.refresh_token) { c.refresh_token = j.refresh_token; addSecret(c.refresh_token) }
  if (!s.readOnly) saveToken(s.file, c) // read-only (VSK_TOKEN_FILE): new token stays in memory only
}

async function accessToken(ctx) {
  const s = loadSession(ctx)
  const exp = parseExpiry(s.cred.expiry)
  if (s.cred.token && (Number.isNaN(exp) || exp - Date.now() > 60_000)) return s.cred.token
  await refreshToken(ctx)
  return s.cred.token
}

// ---------- HTTP ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function retryDelay(r, attempt) {
  const ra = Number(r?.headers?.get?.('retry-after'))
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 30_000)
  return settings.retryBaseMs * 2 ** attempt * (1 + Math.random() * 0.25)
}

function hintFor(status, msg, what) {
  const m = msg.toLowerCase()
  if (m.includes('invalid_grant') || m.includes('expired or revoked') || status === 401)
    return 'Your Google login expired or was removed. Run `node vsk.mjs login` again.'
  if (m.includes('insufficient') && m.includes('scope'))
    return 'Your login is missing a permission. Run `node vsk.mjs login` again and tick every box Google shows.'
  if (m.includes('has not been used') || m.includes('is disabled') || m.includes('api has not'))
    return 'The Google Slides/Drive API is not switched on for the kit\'s Google Cloud project. Tell Nok.'
  if (status === 403)
    return 'Your Google account cannot edit this deck. Ask the deck owner to share it with you as Editor (view or comment access is not enough).'
  if (status === 404) return 'Not found. Check the deck link, and use ids exactly as `outline` / `read` print them (they are case-sensitive).'
  if (status === 429) return 'Google is rate-limiting right now. Wait a minute, then try once more.'
  if (status >= 500) return 'Google had a temporary problem. Wait a minute, then try once more.'
  if (status === 400) return `Google refused this ${what}. Read the message: usually a wrong id (use ids from outline/read) or a bad value.`
  return 'Show this error to the user.'
}

async function httpError(r, what) {
  let msg = ''
  try {
    const t = await r.text()
    try {
      const j = JSON.parse(t)
      msg = j?.error?.message || [j?.error, j?.error_description].filter((x) => typeof x === 'string').join(': ') || t
    } catch { msg = t }
  } catch { /* no body */ }
  msg = scrub(msg).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
  return new VskError(`Google refused (${what}): HTTP ${r.status}${msg ? ` — ${msg}` : ''}`, hintFor(r.status, msg, what), { status: r.status })
}

/** fetch with auth, user-agent, retry on 429/5xx/network (max settings.maxRetries), one refresh on 401. */
export async function request(ctx, url, { method = 'GET', json, form, body, headers = {}, auth = true, what = 'request', raw = false, timeoutMs = 60_000 } = {}) {
  let attempt = 0
  let refreshed = false
  for (;;) {
    const h = { 'user-agent': UA, ...headers }
    let payload = body
    if (json !== undefined) { h['content-type'] = 'application/json; charset=UTF-8'; payload = JSON.stringify(json) }
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString() }
    if (auth) h.authorization = `Bearer ${await accessToken(ctx)}`
    let r
    try {
      r = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      if (attempt < settings.maxRetries) { await sleep(retryDelay(null, attempt++)); continue }
      throw new VskError(`Could not reach Google (${what}${e?.name === 'TimeoutError' ? ': timed out' : ''}).`, 'Check the internet connection, then try once more.')
    }
    if (r.status === 401 && auth && !refreshed && ctx.session?.cred?.refresh_token) {
      refreshed = true
      await r.body?.cancel?.().catch(() => {})
      await refreshToken(ctx)
      continue
    }
    if ((r.status === 429 || r.status >= 500) && attempt < settings.maxRetries) {
      await r.body?.cancel?.().catch(() => {})
      await sleep(retryDelay(r, attempt++))
      continue
    }
    if (!r.ok) throw await httpError(r, what)
    if (raw) return r
    const text = await r.text()
    if (!text) return {}
    try { return JSON.parse(text) } catch { throw new VskError(`Google sent an unreadable reply (${what}).`, 'Try once more; if it repeats, tell Nok.') }
  }
}

const getDeck = (ctx, deck, fields) =>
  request(ctx, `${SLIDES}/${encodeURIComponent(deck)}?fields=${encodeURIComponent(fields)}`, { what: 'read deck' })
const batchUpdate = (ctx, deck, requests, extra = {}) =>
  request(ctx, `${SLIDES}/${encodeURIComponent(deck)}:batchUpdate`, { method: 'POST', json: { requests, ...extra }, what: 'edit deck' })

// ---------- geometry ----------
export const toPt = (emu) => Math.round((emu / EMU_PER_PT) * 10) / 10
const mag = (dim) => (dim ? (dim.unit === 'PT' ? dim.magnitude * EMU_PER_PT : dim.magnitude) || 0 : 0)
const IDENT = [1, 0, 0, 1, 0, 0]

/** Slides AffineTransform → [scaleX, shearY, shearX, scaleY, translateX, translateY] (EMU). */
export function matrixOf(t) {
  if (!t) return [...IDENT]
  const u = t.unit === 'PT' ? EMU_PER_PT : 1
  const any = ['scaleX', 'scaleY', 'shearX', 'shearY'].some((k) => t[k] !== undefined)
  return [t.scaleX ?? (any ? 0 : 1), t.shearY ?? 0, t.shearX ?? 0, t.scaleY ?? (any ? 0 : 1), (t.translateX || 0) * u, (t.translateY || 0) * u]
}
export function compose(p, c) {
  return [
    p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5],
  ]
}
/** Rotation + scale (+ flip in the sign of sy) of a 2×2 matrix. */
export function decompose(a, b, c, d) {
  const sx = Math.hypot(a, b)
  if (sx < 1e-12) return { sx: 0, sy: Math.hypot(c, d), theta: 0 }
  return { sx, sy: (a * d - b * c) / sx, theta: Math.atan2(b, a) }
}
/** Every element (into groups) with its absolute matrix. */
export function* walk(els, parent = IDENT, group = null) {
  for (const el of els || []) {
    const m = compose(parent, matrixOf(el.transform))
    yield { el, m, group }
    if (el.elementGroup) yield* walk(el.elementGroup.children, m, el.objectId)
  }
}
/** Visual bounding box [x0, y0, x1, y1] in EMU. */
export function bboxOf(el, m) {
  if (el.elementGroup) {
    let b = null
    for (const ch of el.elementGroup.children || []) {
      const cb = bboxOf(ch, compose(m, matrixOf(ch.transform)))
      b = b ? [Math.min(b[0], cb[0]), Math.min(b[1], cb[1]), Math.max(b[2], cb[2]), Math.max(b[3], cb[3])] : cb
    }
    return b || [m[4], m[5], m[4], m[5]]
  }
  const W = mag(el.size?.width)
  const H = mag(el.size?.height)
  const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([px, py]) => [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
function leafBox(el, m) {
  const { sx, sy, theta } = decompose(m[0], m[1], m[2], m[3])
  const box = { x: toPt(m[4]), y: toPt(m[5]), w: toPt(mag(el.size?.width) * sx), h: toPt(mag(el.size?.height) * Math.abs(sy)) }
  const deg = Math.round((theta * 1800) / Math.PI) / 10
  if (Math.abs(deg) >= 0.1) box.rotation = deg
  return box
}
const pageSizeEmu = (p) => [mag(p.pageSize?.width) || 9144000, mag(p.pageSize?.height) || 5143500]

/** New AffineTransform for `place`: x/y/w/h in pt, undefined = keep. Keeps rotation/flip. */
export function placeTransform(el, { x, y, w, h }) {
  const [a, b, c, d, e, f] = matrixOf(el.transform)
  const { sx, sy, theta } = decompose(a, b, c, d)
  const W = mag(el.size?.width)
  const H = mag(el.size?.height)
  let nsx = sx
  let nsy = sy
  if (w !== undefined) {
    if (!(w > 0)) throw usage('--w must be more than 0.')
    if (!W) throw new VskError(`Element ${el.objectId} has no width to scale (it may be a line).`, 'Leave out --w for this element.')
    nsx = (w * EMU_PER_PT) / W
  }
  if (h !== undefined) {
    if (!(h > 0)) throw usage('--h must be more than 0.')
    if (!H) throw new VskError(`Element ${el.objectId} has no height to scale (it may be a straight line).`, 'Leave out --h for this element.')
    nsy = ((h * EMU_PER_PT) / H) * (sy < 0 ? -1 : 1)
  }
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const r = (v) => (Math.abs(v) < 1e-12 ? 0 : v) // drop float noise like cos(90°)
  return {
    scaleX: r(nsx * cos), shearY: r(nsx * sin), shearX: r(-nsy * sin), scaleY: r(nsy * cos),
    translateX: x !== undefined ? Math.round(x * EMU_PER_PT) : e,
    translateY: y !== undefined ? Math.round(y * EMU_PER_PT) : f,
    unit: 'EMU',
  }
}

/** `--index N` = final 0-based position. Slides wants an index in the arrangement BEFORE the move. */
export function insertionIndexFor(current, target, total) {
  const t = Math.max(0, Math.min(target, total - 1))
  return { final: t, insertionIndex: t > current ? t + 1 : t, noop: t === current }
}

/** Box (EMU) a picture should fit inside. Missing values fill the slide (5% margin), centred. */
export function imageBox(pageW, pageH, { x, y, w, h }) {
  const mx = pageW * 0.05
  const my = pageH * 0.05
  const X = x !== undefined ? x * EMU_PER_PT : undefined
  const Y = y !== undefined ? y * EMU_PER_PT : undefined
  const bw = w !== undefined ? w * EMU_PER_PT : X !== undefined ? pageW - X - mx : pageW - 2 * mx
  const bh = h !== undefined ? h * EMU_PER_PT : Y !== undefined ? pageH - Y - my : pageH - 2 * my
  if (!(bw > 0) || !(bh > 0)) throw usage('There is no room for the picture with those values.', 'Give --w and --h (pt), or a smaller --x / --y.')
  return {
    x: Math.round(X !== undefined ? X : (pageW - bw) / 2),
    y: Math.round(Y !== undefined ? Y : (pageH - bh) / 2),
    w: Math.round(bw),
    h: Math.round(bh),
  }
}

// ---------- reading elements ----------
const runsText = (text) => (text?.textElements || []).map((t) => t.textRun?.content ?? t.autoText?.content ?? '').join('')
export function elementText(el) {
  if (el.shape) return runsText(el.shape.text)
  if (el.table)
    return (el.table.tableRows || []).map((row) => (row.tableCells || []).map((c) => runsText(c.text).trim()).join('\t')).join('\n')
  if (el.wordArt) return el.wordArt.renderedText || ''
  return ''
}
function kindOf(el) {
  if (el.shape) return 'shape'
  if (el.image) return 'image'
  if (el.table) return 'table'
  if (el.line) return 'line'
  if (el.video) return 'video'
  if (el.sheetsChart) return 'chart'
  if (el.wordArt) return 'wordArt'
  if (el.elementGroup) return 'group'
  return 'other'
}
const isVisual = (el) => Boolean(el.image || el.video || el.sheetsChart || el.table || el.wordArt)
/** True when deleteText would have something to delete (a lone final newline does not count). */
const hasText = (shapeEl) => runsText(shapeEl?.shape?.text).replace(/\n$/, '').length > 0
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const slideLink = (deck, slide) => `https://docs.google.com/presentation/d/${deck}/edit#slide=id.${slide}`
const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`
const safeName = (s) => String(s).replace(/[^\w.-]/g, '_')

function findSlide(p, slideId) {
  const i = (p.slides || []).findIndex((s) => s.objectId === slideId)
  if (i < 0) throw new VskError(`Slide "${slideId}" is not in this deck.`, 'Use a slide id from `outline` (ids are case-sensitive).')
  return { slide: p.slides[i], index: i }
}
function findElement(p, id) {
  for (const [index, s] of (p.slides || []).entries())
    for (const hit of walk(s.pageElements)) if (hit.el.objectId === id) return { ...hit, slide: s.objectId, index }
  throw new VskError(`Element "${id}" is not on any slide of this deck.`, 'Use an element id from `read --slide <id>` (ids are case-sensitive).')
}
function notesShape(slide) {
  const np = slide.slideProperties?.notesPage
  const sid = np?.notesProperties?.speakerNotesObjectId
  const el = (np?.pageElements || []).find((e) => e.objectId === sid)
  return { sid, el }
}

// ---------- check ----------
export function checkDeck(p, expect = []) {
  const [PW, PH] = pageSizeEmu(p)
  const problems = []
  const texts = []
  ;(p.slides || []).forEach((s, i) => {
    let text = ''
    let visual = false
    for (const { el, m } of walk(s.pageElements)) {
      text += elementText(el)
      if (isVisual(el)) visual = true
      if (el.elementGroup) continue
      const [x0, y0, x1, y1] = bboxOf(el, m)
      const box = { x: toPt(x0), y: toPt(y0), w: toPt(x1 - x0), h: toPt(y1 - y0) }
      if (x1 < 0 || y1 < 0 || x0 > PW || y0 > PH)
        problems.push({ type: 'off-slide', slide: s.objectId, number: i + 1, element: el.objectId, box, hint: 'Completely outside the slide: move it with place, or remove it.' })
      else if (x0 < -OFF_TOL || y0 < -OFF_TOL || x1 > PW + OFF_TOL || y1 > PH + OFF_TOL)
        problems.push({ type: 'overflow', slide: s.objectId, number: i + 1, element: el.objectId, box, hint: 'Part of it sticks out past the slide edge.' })
    }
    texts.push(text)
    if (!text.trim() && !visual) problems.push({ type: 'empty-slide', slide: s.objectId, number: i + 1, hint: 'No text and no picture on this slide.' })
  })
  for (const want of expect)
    if (!texts.some((t) => t.includes(want))) problems.push({ type: 'missing-content', expected: want })
  return { ok: problems.length === 0, slides: (p.slides || []).length, pageSize: { w: toPt(PW), h: toPt(PH) }, problems }
}

// ---------- pictures: sniff, ZIP, PPTX ----------
const CONVERT_HINT = 'Google Slides takes PNG, JPEG or GIF. Convert it first (macOS: `sips -s format png in.heic --out out.png`), or use another picture.'
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
function jpegSize(b) {
  let i = 2
  const n = b.length
  while (i < n) {
    if (b[i] !== 0xff) return null
    while (i < n && b[i] === 0xff) i++
    if (i >= n) return null
    const marker = b[i++]
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (marker === 0xd9 || marker === 0xda) return null
    if (i + 2 > n) return null
    const len = b.readUInt16BE(i)
    if (len < 2) return null
    if (SOF.has(marker)) {
      if (i + 7 > n) return null
      const h = b.readUInt16BE(i + 3)
      const w = b.readUInt16BE(i + 5)
      return w && h ? { w, h } : null
    }
    i += len
  }
  return null
}
function otherFormat(b) {
  const head = b.subarray(0, 512).toString('latin1').trimStart().toLowerCase()
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'WebP'
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'AVIF'
    if (/^(hei|hev|mif|msf)/.test(brand)) return 'HEIC/HEIF (iPhone photo)'
    return 'a video file'
  }
  if (b.toString('latin1', 0, 2) === 'BM') return 'BMP'
  if (b.toString('latin1', 0, 4) === '%PDF') return 'PDF'
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'SVG'
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'a web page (HTML)'
  return null
}
export function sniffImage(b) {
  if (!b.length) throw new VskError('The picture file is empty (0 bytes).', 'Pick another file.')
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    if (b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR') {
      const w = b.readUInt32BE(16)
      const h = b.readUInt32BE(20)
      if (w && h) return { mime: 'image/png', ext: 'png', w, h }
    }
    throw new VskError('The PNG file is damaged.', 'Export it again or pick another file.')
  }
  const sig = b.toString('latin1', 0, 6)
  if (sig === 'GIF87a' || sig === 'GIF89a') {
    if (b.length >= 10) {
      const w = b.readUInt16LE(6)
      const h = b.readUInt16LE(8)
      if (w && h) return { mime: 'image/gif', ext: 'gif', w, h }
    }
    throw new VskError('The GIF file is damaged.', 'Export it again or pick another file.')
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const s = jpegSize(b)
    if (s) return { mime: 'image/jpeg', ext: 'jpeg', ...s }
    throw new VskError('The JPEG file is damaged (no picture size found).', 'Export it again or pick another file.')
  }
  const other = otherFormat(b)
  throw new VskError(other ? `That file is ${other}, not a picture Google Slides accepts.` : 'That file is not a PNG, JPEG or GIF picture.', CONVERT_HINT)
}
export function readPicture(file) {
  const p = path.resolve(expandHome(String(file)))
  let st
  try { st = fs.statSync(p) } catch { throw usage(`Picture file not found: ${p}`, 'Give the full path of a PNG, JPEG or GIF on this computer.') }
  if (!st.isFile()) throw usage(`Not a file: ${p}`)
  if (st.size > MAX_IMAGE_BYTES)
    throw new VskError(`The picture is ${(st.size / MB).toFixed(1)} MB; Google Slides takes at most 50 MB.`, 'Make it smaller (JPEG, or fewer pixels).')
  const data = fs.readFileSync(p)
  const info = sniffImage(data)
  if (info.w * info.h > MAX_PIXELS)
    throw new VskError(`The picture is ${info.w}×${info.h} (${((info.w * info.h) / 1e6).toFixed(1)} megapixels); Google Slides takes at most 25.`, 'Resize it first (macOS: `sips -Z 4000 in.png --out out.png`).')
  return { ...info, data, file: p }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
/** Minimal store-only (no compression) ZIP. files: [{name, data: Buffer|string}]. */
export function zipStore(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8')
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28)
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    parts.push(lh, name, data)
    central.push(ch, name)
    offset += 30 + name.length + data.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20)
  return Buffer.concat([...parts, cd, end])
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const rels = (list) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
  .map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`
const TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
const solid3 = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3)
const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="vsk"><a:themeElements><a:clrScheme name="vsk">${
  [['dk1', '000000'], ['lt1', 'FFFFFF'], ['dk2', '1F2937'], ['lt2', 'F3F4F6'], ['accent1', '4472C4'], ['accent2', 'ED7D31'], ['accent3', 'A5A5A5'],
    ['accent4', 'FFC000'], ['accent5', '5B9BD5'], ['accent6', '70AD47'], ['hlink', '0563C1'], ['folHlink', '954F72']]
    .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')
}</a:clrScheme><a:fontScheme name="vsk"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="vsk"><a:fillStyleLst>${solid3}</a:fillStyleLst><a:lnStyleLst>${
  '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3)
}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${solid3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

/** A one-slide .pptx holding just the picture (centred, natural size at 96 dpi, shrunk to fit). */
export function buildPptx(pic) {
  const SW = 9144000
  const SH = 5143500
  const nw = pic.w * EMU_PER_PX
  const nh = pic.h * EMU_PER_PX
  const s = Math.min(1, SW / nw, SH / nh)
  const cx = Math.max(1, Math.round(nw * s))
  const cy = Math.max(1, Math.round(nh * s))
  const media = `image1.${pic.ext}`
  const slide = `${XML}<p:sld ${NS}><p:cSld><p:spTree>${TREE}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture 1"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((SW - cx) / 2)}" y="${Math.round((SH - cy) / 2)}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  const files = [
    { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${pic.ext}" ContentType="${pic.mime}"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>` },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', data: `${XML}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'theme', 'theme/theme1.xml']]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: `${XML}<p:sldMaster ${NS}><p:cSld><p:spTree>${TREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/slides/slide1.xml', data: slide },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/${media}`]]) },
    { name: 'ppt/theme/theme1.xml', data: THEME },
    { name: `ppt/media/${media}`, data: pic.data },
  ]
  return zipStore(files)
}

// ---------- Drive temp import (local picture → Google-hosted URL) ----------
async function driveUpload(ctx, bytes) {
  const meta = { name: TEMP_NAME, mimeType: 'application/vnd.google-apps.presentation' }
  if (bytes.length <= MULTIPART_MAX) {
    const boundary = `vsk${crypto.randomBytes(12).toString('hex')}`
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const j = await request(ctx, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST', body, headers: { 'content-type': `multipart/related; boundary=${boundary}` }, what: 'upload picture', timeoutMs: 300_000,
    })
    return j.id
  }
  // Bigger than 5 MB: resumable upload (multipart is meant for small files).
  const start = await request(ctx, `${DRIVE_UPLOAD}?uploadType=resumable&fields=id`, {
    method: 'POST', json: meta, raw: true, what: 'start picture upload',
    headers: { 'x-upload-content-type': PPTX_MIME, 'x-upload-content-length': String(bytes.length) },
  })
  const loc = start.headers.get('location')
  if (!loc) throw new VskError('Google did not start the picture upload.', 'Try once more; if it repeats, tell Nok.')
  const j = await request(ctx, loc, { method: 'PUT', body: bytes, headers: { 'content-type': PPTX_MIME }, what: 'upload picture', timeoutMs: 600_000 })
  return j.id
}
async function tempImageUrl(ctx, fileId) {
  for (let i = 0; ; i++) {
    let p
    try {
      p = await request(ctx, `${SLIDES}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('slides(pageElements)')}`, { what: 'read temp import' })
    } catch (e) {
      if (e.status === 404 && i < 3) { await sleep(settings.retryBaseMs); continue }
      throw e
    }
    for (const s of p.slides || []) for (const { el } of walk(s.pageElements)) if (el.image?.contentUrl) return el.image.contentUrl
    throw new VskError('Google could not read the picture from the temporary import.', 'Try a PNG or JPEG export of the picture, or use --url with a public https link.')
  }
}
async function trashQuiet(ctx, fileId) {
  try {
    await request(ctx, `${DRIVE}/${encodeURIComponent(fileId)}?fields=id,trashed`, { method: 'PATCH', json: { trashed: true }, what: 'trash temp file' })
    return true
  } catch { return false }
}
/** upload .pptx → read temp deck → use(contentUrl) → ALWAYS move the temp file to the trash. */
async function viaTempImport(ctx, pic, use) {
  const fileId = await driveUpload(ctx, buildPptx(pic))
  if (!fileId) throw new VskError('Google did not return the uploaded file.', 'Try once more; if it repeats, tell Nok.')
  try {
    return await use(await tempImageUrl(ctx, fileId))
  } finally {
    if (!(await trashQuiet(ctx, fileId)))
      ctx.warnings.push(`A temporary file "${TEMP_NAME}" is left in your Google Drive (id ${fileId}). Move it to the trash by hand.`)
  }
}

// ---------- login ----------
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32))
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) }
}
export function buildAuthUrl({ clientId, redirectUri, state, challenge }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES, state,
    code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent',
  })
  return `${AUTH_URL}?${q}`
}
function openInBrowser(url) {
  let child
  if (process.platform === 'darwin') child = spawn('open', [url], { stdio: 'ignore', detached: true })
  else if (process.platform === 'win32')
    child = spawn('cmd', ['/c', 'start', '""', `"${url.replace(/&/g, '^&')}"`], { stdio: 'ignore', detached: true, windowsVerbatimArguments: true })
  else child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}
function replyPage(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Visrec Slides Kit</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h2>Visrec Slides Kit</h2><p>${text}</p></body>`)
}
/** Loopback listener on 127.0.0.1:<random>; resolves with the auth code after checking `state`. */
function waitForCode(state, onReady) {
  return new Promise((resolve, reject) => {
    let done = false
    let timer
    const server = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://127.0.0.1')
      if (u.pathname !== '/') { res.writeHead(404).end(); return }
      const q = u.searchParams
      if (q.get('state') !== state) {
        replyPage(res, 400, 'This sign-in reply does not match. Go back to your AI app and run login again.')
        finish(new VskError('Sign-in failed: the reply did not match this login (state mismatch).', 'Run `node vsk.mjs login` again and finish it in the newest browser tab.'))
        return
      }
      if (q.get('error')) {
        replyPage(res, 200, 'Sign-in was cancelled. You can close this tab.')
        finish(new VskError(`Google sign-in was cancelled (${q.get('error')}).`, 'Run login again and allow every permission Google asks for.'))
        return
      }
      const code = q.get('code')
      if (!code) { replyPage(res, 400, 'No sign-in code came back.'); finish(new VskError('Google sent no sign-in code.', 'Run login again.')); return }
      replyPage(res, 200, 'Signed in. You can close this tab and go back to your AI app.')
      finish(null, code)
    })
    function finish(err, code) {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections?.()
      if (err) reject(err)
      else resolve(code)
    }
    timer = setTimeout(() => finish(new VskError('Sign-in timed out (no reply from the browser in 5 minutes).', 'Run `node vsk.mjs login` again and finish signing in in the browser.')), settings.loginTimeoutMs)
    server.on('error', (e) => finish(new VskError(`Could not start the sign-in listener (${e.code || e.message}).`, 'Try again; if it repeats, restart the computer.')))
    server.listen(0, '127.0.0.1', () => {
      try { onReady(`http://127.0.0.1:${server.address().port}`) } catch (e) { finish(e) }
    })
  })
}
function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email || null } catch { return null }
}

// ---------- commands ----------
const CMD = {}
const deckOf = (f) => parseDeck(f.deck).id
const slideOrHint = (f) => {
  if (f.slide !== undefined && f.slide !== true && f.slide !== '') return String(f.slide)
  const hint = parseDeck(f.deck).slide
  if (hint) return hint
  throw usage('--slide is required.', 'Use a slide id from `outline`.')
}

CMD.login = {
  flags: [],
  async run(ctx) {
    if (isReadOnly(ctx.env))
      throw new VskError('login is switched off while VSK_TOKEN_FILE is set (that token file is read-only for vsk).', 'Unset VSK_TOKEN_FILE to log in with your own account.')
    const client = loadClient(ctx.env)
    const { verifier, challenge } = pkcePair()
    const state = b64url(crypto.randomBytes(16))
    let redirectUri
    const code = await waitForCode(state, (uri) => {
      redirectUri = uri
      const url = buildAuthUrl({ clientId: client.clientId, redirectUri: uri, state, challenge })
      ctx.err(`Opening Google sign-in in your browser. If it does not open, copy this link into the browser:\n${url}\n`)
      ;(ctx.openBrowser || openInBrowser)(url)
    })
    const tok = await request(ctx, client.tokenUri, {
      method: 'POST', auth: false, what: 'finish sign-in',
      form: { code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier },
    })
    addSecret(tok.access_token); addSecret(tok.refresh_token); addSecret(tok.id_token)
    const granted = String(tok.scope || '').split(/\s+/)
    const missing = NEEDED_SCOPES.filter((s) => !granted.includes(s))
    if (missing.length)
      throw new VskError(`Google did not give all the permissions vsk needs (missing: ${missing.map((s) => s.split('/').pop()).join(', ')}).`,
        'Run `node vsk.mjs login` again and tick every box on Google\'s permission screen.')
    if (!tok.refresh_token) throw new VskError('Google did not give a long-lived login (no refresh token).', 'Run `node vsk.mjs login` again.')
    let email = emailFromIdToken(tok.id_token)
    if (!email) {
      const u = await request(ctx, USERINFO_URL, { auth: false, headers: { authorization: `Bearer ${tok.access_token}` }, what: 'who am I' })
      email = u.email || null
    }
    const file = tokenPath(ctx.env)
    saveToken(file, {
      token: tok.access_token, refresh_token: tok.refresh_token, token_uri: client.tokenUri,
      client_id: client.clientId, client_secret: client.clientSecret,
      expiry: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
      email, scopes: granted.filter(Boolean),
    })
    return { loggedIn: true, email, tokenFile: file }
  },
}

CMD.logout = {
  flags: [],
  async run(ctx) {
    if (isReadOnly(ctx.env))
      throw new VskError('logout is switched off while VSK_TOKEN_FILE is set (vsk never revokes or deletes that file).', 'Unset VSK_TOKEN_FILE to log out your own vsk login.')
    const file = tokenPath(ctx.env)
    if (!fs.existsSync(file)) return { loggedOut: true, note: 'You were not logged in.' }
    let cred = {}
    try { cred = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* damaged: just remove it */ }
    for (const k of ['token', 'refresh_token', 'client_secret']) addSecret(cred[k])
    let revoked = false
    const t = cred.refresh_token || cred.token
    if (t) {
      try { await request(ctx, REVOKE_URL, { method: 'POST', auth: false, form: { token: t }, what: 'sign out at Google' }); revoked = true } catch (e) {
        if (e.status === 400) revoked = 'already invalid'
        else ctx.warnings.push('Could not reach Google to cancel the login there; you can remove "Visrec Slides" at https://myaccount.google.com/connections')
      }
    }
    fs.rmSync(file, { force: true })
    return { loggedOut: true, revoked, removed: file }
  },
}

CMD.whoami = {
  flags: [],
  async run(ctx) {
    const s = loadSession(ctx)
    const u = await request(ctx, USERINFO_URL, { what: 'who am I' })
    return { email: u.email || s.cred.email || null, tokenFile: s.file, readOnly: s.readOnly }
  },
}

CMD.version = { flags: [], async run() { return { version: VERSION } } }

CMD.outline = {
  flags: ['deck'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const p = await getDeck(ctx, deck, 'presentationId,title,pageSize,slides(objectId,pageElements)')
    const [PW, PH] = pageSizeEmu(p)
    return {
      deck, title: p.title, url: `https://docs.google.com/presentation/d/${deck}/edit`,
      pageSize: { w: toPt(PW), h: toPt(PH) },
      slides: (p.slides || []).map((s, i) => {
        const texts = []
        let elements = 0
        let hasImage = false
        for (const { el } of walk(s.pageElements)) {
          if (el.elementGroup) continue
          elements++
          if (el.image) hasImage = true
          const t = elementText(el).replace(/\s+/g, ' ').trim()
          if (t) texts.push(t)
        }
        return { index: i, number: i + 1, id: s.objectId, text: clip(texts.join(' | '), 120), elements, hasImage }
      }),
    }
  },
}

CMD.read = {
  flags: ['deck', 'slide'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const slideId = slideOrHint(f)
    const p = await getDeck(ctx, deck, 'pageSize,slides(objectId,pageElements,slideProperties)')
    const { slide, index } = findSlide(p, slideId)
    const elements = []
    for (const { el, m, group } of walk(slide.pageElements)) {
      const kind = kindOf(el)
      const item = { id: el.objectId, kind }
      if (el.shape) item.shape = el.shape.shapeType
      item.placeholder = el.shape?.placeholder?.type || null
      item.text = elementText(el).replace(/\n+$/, '')
      if (el.elementGroup) {
        const [x0, y0, x1, y1] = bboxOf(el, m)
        Object.assign(item, { x: toPt(x0), y: toPt(y0), w: toPt(x1 - x0), h: toPt(y1 - y0), children: (el.elementGroup.children || []).length })
      } else Object.assign(item, leafBox(el, m))
      if (group) item.group = group
      elements.push(item)
    }
    const { el: notesEl } = notesShape(slide)
    return { slide: slide.objectId, index, number: index + 1, elements, notes: notesEl ? elementText(notesEl).replace(/\n+$/, '') : '' }
  },
}

const SIZES = ['SMALL', 'MEDIUM', 'LARGE']
function sizeArg(f, def) {
  const s = String(f.size ?? def).toUpperCase()
  if (!SIZES.includes(s)) throw usage(`--size must be SMALL, MEDIUM or LARGE (got "${f.size}").`)
  return s
}
async function saveThumb(ctx, deck, slideId, size, file) {
  const j = await request(ctx, `${SLIDES}/${encodeURIComponent(deck)}/pages/${encodeURIComponent(slideId)}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=${size}`, { what: 'make slide picture' })
  if (!j.contentUrl) throw new VskError('Google made no slide picture.', 'Try once more.')
  const r = await request(ctx, j.contentUrl, { auth: false, raw: true, what: 'download slide picture' })
  const buf = Buffer.from(await r.arrayBuffer())
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  return { file: path.resolve(file), width: j.width, height: j.height }
}
const thumbDir = (deck) => path.join(os.tmpdir(), 'vsk-thumbs', safeName(deck))

CMD.thumb = {
  flags: ['deck', 'slide', 'size', 'out'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const slideId = slideOrHint(f)
    const size = sizeArg(f, 'LARGE')
    let file = path.join(thumbDir(deck), `slide-${safeName(slideId)}.png`)
    if (f.out !== undefined) {
      const o = path.resolve(expandHome(String(f.out)))
      const isDir = /[\\/]$/.test(String(f.out)) || (fs.existsSync(o) && fs.statSync(o).isDirectory())
      file = isDir ? path.join(o, `slide-${safeName(slideId)}.png`) : o
    }
    const t = await saveThumb(ctx, deck, slideId, size, file)
    return { slide: slideId, ...t, note: 'Open this PNG and look at it before telling the user the slide is done.' }
  },
}

CMD.thumbs = {
  flags: ['deck', 'size', 'out'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const size = sizeArg(f, 'MEDIUM')
    const dir = f.out !== undefined ? path.resolve(expandHome(String(f.out))) : thumbDir(deck)
    const p = await getDeck(ctx, deck, 'slides(objectId)')
    const files = []
    for (const [i, s] of (p.slides || []).entries()) {
      const t = await saveThumb(ctx, deck, s.objectId, size, path.join(dir, `${String(i + 1).padStart(2, '0')}-${safeName(s.objectId)}.png`))
      files.push({ number: i + 1, id: s.objectId, file: t.file })
    }
    return { slides: files.length, dir, files }
  },
}

CMD.dup = {
  flags: ['deck', 'from', 'index', 'replace'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const from = String(need(f, 'from', 'Use the id of the slide to copy, from `outline`.'))
    const index = optIndex(f, 'index')
    const replace = f.replace !== undefined ? jsonArg(f.replace, 'replace') : {}
    if (!replace || typeof replace !== 'object' || Array.isArray(replace) || Object.entries(replace).some(([k, v]) => !k || typeof v !== 'string'))
      throw usage('--replace must be a JSON object of "old text": "new text" (strings, no empty keys).')
    const p = await getDeck(ctx, deck, 'slides(objectId)')
    const ids = (p.slides || []).map((s) => s.objectId)
    const fromIdx = ids.indexOf(from)
    if (fromIdx < 0) throw new VskError(`Slide "${from}" is not in this deck.`, 'Use a slide id from `outline` (ids are case-sensitive).')
    const id = newId('vsk_s')
    const reqs = [{ duplicateObject: { objectId: from, objectIds: { [from]: id } } }]
    let final = fromIdx + 1
    if (index !== undefined) {
      const mv = insertionIndexFor(fromIdx + 1, index, ids.length + 1)
      final = mv.final
      if (!mv.noop) reqs.push({ updateSlidesPosition: { slideObjectIds: [id], insertionIndex: mv.insertionIndex } })
    }
    const offset = reqs.length
    const pairs = Object.entries(replace)
    for (const [o, n] of pairs) reqs.push({ replaceAllText: { containsText: { text: o, matchCase: true }, replaceText: n, pageObjectIds: [id] } })
    const res = await batchUpdate(ctx, deck, reqs)
    const replaced = {}
    pairs.forEach(([o], i) => { replaced[o] = res.replies?.[offset + i]?.replaceAllText?.occurrencesChanged || 0 })
    const out = { slideId: id, index: final, number: final + 1, link: slideLink(deck, id) }
    if (pairs.length) out.replaced = replaced
    const notFound = pairs.filter(([o]) => !replaced[o]).map(([o]) => o)
    if (notFound.length) out.warnings = [`Not found on the new slide (nothing changed): ${notFound.map((s) => JSON.stringify(s)).join(', ')}`]
    return out
  },
}

CMD.replace = {
  flags: ['deck', 'find', 'with', 'slide'],
  multi: ['slide'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const find = String(need(f, 'find', 'Give the exact text to look for.'))
    if (f.with === undefined || f.with === true) throw usage('--with is required (use --with "" to remove the text).')
    const slides = (f.slide || []).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean)
    const r = { replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: String(f.with) } }
    if (slides.length) r.replaceAllText.pageObjectIds = slides
    const res = await batchUpdate(ctx, deck, [r])
    const n = res.replies?.[0]?.replaceAllText?.occurrencesChanged || 0
    const out = { find, occurrencesChanged: n, slides: slides.length ? slides : 'all' }
    if (!n) out.warnings = ['Nothing matched (the match is exact and case-sensitive). Check the text with `read`.']
    return out
  },
}

CMD.text = {
  flags: ['deck', 'element', 'text', 'text-file'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const id = String(need(f, 'element', 'Use an element id from `read`.'))
    const text = textArg(f, 'text', 'text-file')
    if (text === undefined) throw usage('--text (or --text-file) is required. Use --text "" to empty the box.')
    const p = await getDeck(ctx, deck, 'slides(objectId,pageElements)')
    const hit = findElement(p, id)
    if (!hit.el.shape) {
      const kind = kindOf(hit.el)
      throw new VskError(`Element "${id}" is a ${kind}, not a text box or shape.`,
        kind === 'table' ? 'For tables use `replace --find … --with … --slide <id>`, or `batch` with cellLocation.' : 'Pick a shape / text box id from `read`.')
    }
    const reqs = []
    if (hasText(hit.el)) reqs.push({ deleteText: { objectId: id, textRange: { type: 'ALL' } } })
    if (text) reqs.push({ insertText: { objectId: id, insertionIndex: 0, text } })
    if (reqs.length) await batchUpdate(ctx, deck, reqs)
    return { element: id, slide: hit.slide, changed: reqs.length > 0, text }
  },
}

CMD.del = {
  flags: ['deck', 'slide', 'yes'],
  async run(ctx, f) {
    if (f.yes !== true)
      throw new VskError('del needs --yes. Deleting a slide removes it for everyone working on the deck.',
        'Ask the user first: show the slide number and its text from `outline`. Only after they say yes, run again with --yes.', { exit: 2 })
    const deck = deckOf(f)
    const slideId = String(need(f, 'slide', 'Use a slide id from `outline`.'))
    const p = await getDeck(ctx, deck, 'slides(objectId,pageElements)')
    const { slide, index } = findSlide(p, slideId)
    const text = clip([...walk(slide.pageElements)].map(({ el }) => elementText(el).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '), 120)
    await batchUpdate(ctx, deck, [{ deleteObject: { objectId: slideId } }])
    return { deleted: slideId, number: index + 1, text, undo: 'Google Slides → File → Version history can bring it back.' }
  },
}

CMD['move-slide'] = {
  flags: ['deck', 'slide', 'index'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const slideId = String(need(f, 'slide', 'Use a slide id from `outline`.'))
    const index = optIndex(f, 'index')
    if (index === undefined) throw usage('--index is required (0-based final position: slide number 1 = index 0).')
    const p = await getDeck(ctx, deck, 'slides(objectId)')
    const { index: cur } = findSlide(p, slideId)
    const mv = insertionIndexFor(cur, index, p.slides.length)
    if (!mv.noop) await batchUpdate(ctx, deck, [{ updateSlidesPosition: { slideObjectIds: [slideId], insertionIndex: mv.insertionIndex } }])
    return { slide: slideId, from: cur, index: mv.final, number: mv.final + 1, moved: !mv.noop }
  },
}

function offSlideWarning(box, PW, PH) {
  const [x0, y0, x1, y1] = box
  if (x0 < -OFF_TOL || y0 < -OFF_TOL || x1 > PW + OFF_TOL || y1 > PH + OFF_TOL)
    return `Part of it is now outside the slide (slide is ${toPt(PW)} × ${toPt(PH)} pt).`
  return null
}

CMD.place = {
  flags: ['deck', 'element', 'x', 'y', 'w', 'h'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const id = String(need(f, 'element', 'Use an element id from `read`.'))
    const v = { x: optNum(f, 'x'), y: optNum(f, 'y'), w: optNum(f, 'w'), h: optNum(f, 'h') }
    if (Object.values(v).every((n) => n === undefined)) throw usage('Nothing to change: give at least one of --x --y --w --h (pt).')
    const p = await getDeck(ctx, deck, 'pageSize,slides(objectId,pageElements)')
    const [PW, PH] = pageSizeEmu(p)
    const hit = findElement(p, id)
    if (hit.group) throw new VskError(`Element "${id}" is inside group "${hit.group}".`, `Move the whole group instead: place --element ${hit.group}`)
    let transform
    if (hit.el.elementGroup) {
      if (v.w !== undefined || v.h !== undefined) throw new VskError('Resizing a group is not supported.', 'Resize the pieces one by one (ungroup in Google Slides), or only move it with --x / --y.')
      const [x0, y0] = bboxOf(hit.el, hit.m)
      const [a, b, c, d, e, g] = matrixOf(hit.el.transform)
      transform = { scaleX: a, shearY: b, shearX: c, scaleY: d, unit: 'EMU',
        translateX: Math.round(e + (v.x !== undefined ? v.x * EMU_PER_PT - x0 : 0)), translateY: Math.round(g + (v.y !== undefined ? v.y * EMU_PER_PT - y0 : 0)) }
    } else transform = placeTransform(hit.el, v)
    await batchUpdate(ctx, deck, [{ updatePageElementTransform: { objectId: id, applyMode: 'ABSOLUTE', transform } }])
    const moved = { ...hit.el, transform }
    const m = matrixOf(transform)
    const out = { element: id, slide: hit.slide }
    if (hit.el.elementGroup) {
      const [x0, y0, x1, y1] = bboxOf(moved, m)
      Object.assign(out, { x: toPt(x0), y: toPt(y0), w: toPt(x1 - x0), h: toPt(y1 - y0) })
    } else Object.assign(out, leafBox(moved, m))
    const warn = offSlideWarning(bboxOf(moved, m), PW, PH)
    if (warn) out.warnings = [warn]
    return out
  },
}

CMD.image = {
  flags: ['deck', 'slide', 'file', 'url', 'x', 'y', 'w', 'h'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const slideId = String(need(f, 'slide', 'Use a slide id from `outline`.'))
    const hasFile = f.file !== undefined && f.file !== ''
    const hasUrl = f.url !== undefined && f.url !== ''
    if (hasFile === hasUrl) throw usage('image needs exactly one of --file <path> or --url <https link>.')
    const v = { x: optNum(f, 'x'), y: optNum(f, 'y'), w: optNum(f, 'w'), h: optNum(f, 'h') }
    if ((v.w !== undefined && !(v.w > 0)) || (v.h !== undefined && !(v.h > 0))) throw usage('--w and --h must be more than 0.')
    let pic = null
    if (hasFile) pic = readPicture(f.file) // check the file before touching Google
    else {
      let u
      try { u = new URL(String(f.url)) } catch { throw usage('--url is not a valid link.') }
      if (u.protocol !== 'https:') throw usage('--url must start with https://', 'For a picture on this computer use --file instead.')
    }
    const p = await getDeck(ctx, deck, 'pageSize,slides(objectId)')
    findSlide(p, slideId)
    const [PW, PH] = pageSizeEmu(p)
    const box = imageBox(PW, PH, v)
    const objectId = newId('vsk_i')
    const create = (url) => batchUpdate(ctx, deck, [{
      createImage: {
        objectId, url,
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: box.w, unit: 'EMU' }, height: { magnitude: box.h, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: box.x, translateY: box.y, unit: 'EMU' },
        },
      },
    }])
    try {
      if (pic) await viaTempImport(ctx, pic, create)
      else await create(String(f.url))
    } catch (e) {
      if (e instanceof VskError && e.status === 400 && !pic)
        e.hint = 'Google could not fetch that link. It must be a public https PNG/JPEG/GIF that opens without signing in (max 50 MB). For a picture on this computer use --file.'
      throw e
    }
    const out = { imageId: objectId, slide: slideId, source: pic ? pic.file : String(f.url) }
    try {
      const page = await request(ctx, `${SLIDES}/${encodeURIComponent(deck)}/pages/${encodeURIComponent(slideId)}`, { what: 'read slide' })
      const hit = [...walk(page.pageElements)].find(({ el }) => el.objectId === objectId)
      if (hit) {
        Object.assign(out, leafBox(hit.el, hit.m))
        const warn = offSlideWarning(bboxOf(hit.el, hit.m), PW, PH)
        if (warn) out.warnings = [warn]
      }
    } catch { /* the picture is in; reporting its box is a nice-to-have */ }
    return out
  },
}

CMD.notes = {
  flags: ['deck', 'slide', 'set', 'set-file'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const slideId = slideOrHint(f)
    const set = textArg(f, 'set', 'set-file')
    const p = await getDeck(ctx, deck, 'slides(objectId,slideProperties)')
    const { slide } = findSlide(p, slideId)
    const { sid, el } = notesShape(slide)
    const current = el ? elementText(el).replace(/\n+$/, '') : ''
    if (set === undefined) return { slide: slideId, notes: current }
    if (!sid) throw new VskError('This slide has no speaker-notes box.', 'Add notes once in Google Slides by hand, then try again.')
    const reqs = []
    if (el && hasText(el)) reqs.push({ deleteText: { objectId: sid, textRange: { type: 'ALL' } } })
    if (set) reqs.push({ insertText: { objectId: sid, insertionIndex: 0, text: set } })
    if (reqs.length) await batchUpdate(ctx, deck, reqs)
    return { slide: slideId, notes: set, before: current }
  },
}

CMD.batch = {
  flags: ['deck', 'requests'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const j = jsonArg(need(f, 'requests', 'Pass a JSON array of Slides API requests, or @file.json.'), 'requests')
    const requests = Array.isArray(j) ? j : j?.requests
    if (!Array.isArray(requests) || !requests.length || requests.some((r) => !r || typeof r !== 'object' || Array.isArray(r)))
      throw usage('--requests must be a non-empty JSON array of request objects (or {"requests": [...]}).')
    const res = await batchUpdate(ctx, deck, requests, !Array.isArray(j) && j.writeControl ? { writeControl: j.writeControl } : {})
    return { requests: requests.length, replies: res.replies || [] }
  },
}

CMD.check = {
  flags: ['deck', 'expect'],
  async run(ctx, f) {
    const deck = deckOf(f)
    const expect = f.expect !== undefined ? jsonArg(f.expect, 'expect') : []
    if (!Array.isArray(expect) || expect.some((s) => typeof s !== 'string')) throw usage('--expect must be a JSON array of strings.')
    const p = await getDeck(ctx, deck, 'pageSize,slides(objectId,pageElements)')
    const r = checkDeck(p, expect)
    if (!r.ok) ctx.exitCode = 1
    return r
  },
}

export const HELP = `Visrec Slides Kit (vsk) ${VERSION} — edit Google Slides as yourself, with your own Google login.
Usage: node vsk.mjs <command> [--flags]      --deck takes the deck link or its id.

Sign in (once per computer)
  login                     opens Google sign-in in the browser and saves your login here
  whoami                    which Google account is logged in
  logout                    sign out and remove the saved login

Look
  outline --deck D          title, page size, every slide: index, number, id, first text, elements, hasImage
  read    --deck D --slide S                every element (id, kind, text, x/y/w/h in pt) + speaker notes
  thumb   --deck D --slide S [--size SMALL|MEDIUM|LARGE] [--out file.png]   PNG of one slide
  thumbs  --deck D [--size SMALL|MEDIUM|LARGE] [--out folder]               PNGs of all slides
  check   --deck D [--expect '["text", …]']  finds elements off the slide, empty slides, missing text

Change
  replace --deck D --find OLD --with NEW [--slide S …]      swap text (exact, case-sensitive)
  text    --deck D --element E (--text T | --text-file F)    replace ALL text in one box
  dup     --deck D --from S [--index N] [--replace '{"old":"new"}' | @file]   copy a slide, swap text on the copy
  move-slide --deck D --slide S --index N                    move a slide (N = final 0-based position)
  place   --deck D --element E [--x X] [--y Y] [--w W] [--h H]   move/resize in pt; left-out values stay
  image   --deck D --slide S (--file pic.png | --url https://…) [--x --y --w --h]
                            add a picture; it fits inside the box (default: the slide), keeping its shape
  notes   --deck D --slide S [--set T | --set-file F]        read or replace speaker notes
  del     --deck D --slide S --yes                           delete a slide (ask the user first!)
  batch   --deck D --requests '<json>' | @file.json          raw Slides batchUpdate (expert escape hatch)
  version | help

Rules for the AI
  1. outline first, then read the slide you will change. Use ids exactly as printed.
  2. Change only the slides the user asked about (give replace a --slide).
  3. After every change run thumb and LOOK at the PNG before you say it is done.
  4. Never run del without asking the user; only then add --yes.
  5. Edits are saved under the user's own name (Google Slides → File → Version history).
  6. Local picture: image --file. Public link: image --url.
  7. If a command fails, show the user the "hint". Do not retry in a loop.

Output: JSON on stdout. Errors: JSON {"error","hint"} on stderr, exit code 1 or 2 (check exits 1 when it finds problems).
Units: pt (72 pt = 1 inch). Index: 0-based (slide number 1 = index 0). Line breaks in --text: real newlines, or --text-file.`

/** Valid JSON; arrays print one item per line so long lists stay readable. */
export function pretty(v, depth = 0) {
  const pad = '  '.repeat(depth + 1)
  const end = '  '.repeat(depth)
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + JSON.stringify(x)).join(',\n')}\n${end}]` : '[]'
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined)
    return keys.length ? `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${pretty(v[k], depth + 1)}`).join(',\n')}\n${end}}` : '{}'
  }
  return JSON.stringify(v)
}

/** Run one CLI command. Returns the exit code. io: {env, out, err, openBrowser}. */
export async function run(argv, io = {}) {
  const ctx = {
    env: io.env || process.env,
    out: io.out || ((s) => process.stdout.write(`${s}\n`)),
    err: io.err || ((s) => process.stderr.write(`${s}\n`)),
    openBrowser: io.openBrowser,
    warnings: [],
    exitCode: 0,
    session: null,
  }
  try {
    const { cmd, flags, rest } = parseArgs(argv)
    if (!cmd || cmd === 'help' || flags.help) { ctx.out(HELP); return 0 }
    if (cmd === '--version') { ctx.out(pretty({ version: VERSION })); return 0 }
    const spec = Object.hasOwn(CMD, cmd) ? CMD[cmd] : null
    if (!spec) throw usage(`Unknown command "${cmd}".`)
    if (rest.length) throw usage(`Unexpected argument "${clip(rest[0], 60)}".`, 'Values go right after their --flag, e.g. --deck <link>. Put text with spaces in quotes.')
    for (const k of Object.keys(flags))
      if (!spec.flags.includes(k)) throw usage(`${cmd} does not take --${k}.`, `${cmd} takes: ${spec.flags.map((x) => `--${x}`).join(' ') || 'no options'}`)
    const f = {}
    for (const [k, vals] of Object.entries(flags)) f[k] = (spec.multi || []).includes(k) ? vals : vals[vals.length - 1]
    const data = await spec.run(ctx, f)
    if (ctx.warnings.length) data.warnings = [...(data.warnings || []), ...ctx.warnings]
    ctx.out(scrubKnown(pretty(data)))
    return ctx.exitCode
  } catch (e) {
    const known = e instanceof VskError
    const outErr = {
      error: scrub(known ? e.message : `Unexpected error: ${e?.message || e}`),
      hint: scrub(known ? e.hint : 'This looks like a bug in vsk. Show this message to Nok.'),
    }
    if (ctx.warnings.length) outErr.warnings = ctx.warnings.map(scrub)
    ctx.err(JSON.stringify(outErr))
    return known ? e.exit : 1
  }
}

const isMain = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (isMain) run(process.argv.slice(2)).then((code) => { process.exitCode = code })
