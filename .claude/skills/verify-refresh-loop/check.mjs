#!/usr/bin/env -S node --experimental-vm-modules --no-warnings
// Exhaustive interleaving check of frame-app's weather refresh loop (src/main.js).
//
// Runs the real, unmodified src/*.js in a fresh vm context per path. The only stand-ins are the
// browser APIs main.js touches: setTimeout/clearTimeout (a timer only fires when the checker
// fires it), fetch (an Open-Meteo request settles only when the checker settles it), a minimal
// document, localStorage and location. From page load it explores every order of:
//   tap        the user taps the frame (document 'click' -> refreshWeather)
//   fire T     a pending setTimeout fires (refreshWeather)
//   ok F       Open-Meteo request F returns 200
//   fail F     Open-Meteo request F fails (network error)
// up to MAX_REQUESTS Open-Meteo requests in total, from both start states (no cache, cache present),
// and checks every property after every step. Shortest counterexamples first (breadth-first).
//
// Usage: check.mjs [--max N] [--src DIR] [--mutants] [--json]
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const MAX_REQUESTS = Number(opt('--max', 4));
const SRC = resolve(opt('--src', join(HERE, '../../../src')));
const EXPECTED = JSON.parse(readFileSync(join(HERE, 'expected.json'), 'utf8'));

// ---- properties -----------------------------------------------------------------------------
// Each returns null when it holds, or a short reason when it is broken.
const PROPERTIES = {
  // An unattended frame must never stop refreshing: some refresh is always scheduled or running.
  KeepsRefreshing: (w) =>
    w.timers.size + w.inflight.size >= 1 ? null : 'no refresh timer is pending and no request is in flight',
  // One refresh loop: at most one refresh timer is pending at a time.
  OneRefreshTimer: (w) =>
    w.timers.size <= 1 ? null : `${w.timers.size} refresh timers are pending (${[...w.timers.keys()].map((t) => 'T' + t).join(', ')})`,
  // The panel never goes back to an older forecast: a newer request's forecast, once shown, is
  // not replaced by an older request's.
  NewestForecastShown: (w) => w.wentBack,
};

// ---- a world: one fresh instance of the real app ---------------------------------------------
function forecast(seq) {
  // A well-formed Open-Meteo response whose current temperature is the request number,
  // so the rendered panel tells us which response it shows.
  const hours = Array.from({ length: 144 }, (_, i) => `2026-11-${String(21 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
  const days = Array.from({ length: 6 }, (_, i) => `2026-11-${21 + i}`);
  return {
    latitude: 52.23, longitude: 21.01, timezone: 'Europe/Warsaw',
    current: { time: '2026-11-21T12:30', temperature_2m: seq, apparent_temperature: seq, relative_humidity_2m: 80, weather_code: 2, wind_speed_10m: 10, is_day: 1 },
    hourly: { time: hours, temperature_2m: hours.map(() => 1), weather_code: hours.map(() => 3), precipitation_probability: hours.map(() => 10), is_day: hours.map(() => 1) },
    daily: { time: days, weather_code: days.map(() => 3), temperature_2m_max: days.map(() => 4), temperature_2m_min: days.map(() => 1), precipitation_probability_max: days.map(() => 20), sunrise: days.map((d) => `${d}T07:06`), sunset: days.map((d) => `${d}T15:36`) },
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

async function makeWorld({ cached, patch }) {
  const w = { timers: new Map(), inflight: new Map(), okSeqs: [], requests: 0, timerSeq: 0, clicks: [], reloaded: false, wentBack: null };
  w.store = () => store.get('weather-v1') ?? null;
  const els = {};
  const el = (id) =>
    (els[id] ??= { textContent: '', innerHTML: '', className: '', classList: { toggle(c, on) { els[id].className = on ? c : ''; } } });
  const store = new Map(cached ? [['weather-v1', JSON.stringify(forecast(0))]] : []);
  w.els = els;
  w.shownSeq = () => {
    const m = /now-temp">(-?\d+)°/.exec(el('now').innerHTML);
    return m ? Number(m[1]) : null;
  };
  const sandbox = {
    console: { error() {}, log() {}, warn() {} },
    URL, URLSearchParams,
    location: { search: '', reload() { w.reloaded = true; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    document: { getElementById: el, addEventListener: (type, fn) => type === 'click' && w.clicks.push(fn) },
    setTimeout: (fn, ms) => (w.timers.set(++w.timerSeq, { fn, ms }), w.timerSeq),
    clearTimeout: (id) => w.timers.delete(id),
    setInterval: () => 0, // the 1 s clock tick and the 5 min version check are out of scope
    fetch: (url) => {
      if (String(url).includes('version.json')) return Promise.resolve({ ok: true, json: async () => ({ sha: 'same' }) });
      const seq = ++w.requests;
      return new Promise((ok, fail) => w.inflight.set(seq, { ok, fail }));
    },
  };
  const context = vm.createContext(sandbox);
  const mods = new Map();
  const load = (file) => {
    if (mods.has(file)) return mods.get(file);
    let m;
    if (file.endsWith('.css')) m = new vm.SyntheticModule([], () => {}, { context, identifier: file });
    else {
      let code = readFileSync(file, 'utf8');
      for (const p of patch ?? []) if (p.file === file.slice(SRC.length + 1)) {
        if (!code.includes(p.find)) throw new Error(`mutant patch not found in ${p.file}: ${p.find}`);
        code = code.replace(p.find, p.replace);
      }
      m = new vm.SourceTextModule(code, { context, identifier: file });
    }
    mods.set(file, m);
    return m;
  };
  const main = load(join(SRC, 'main.js'));
  await main.link((spec, ref) => load(resolve(dirname(ref.identifier), spec)));
  await main.evaluate();
  await settle();
  return w;
}

function enabled(w) {
  const ev = [];
  if (w.requests < MAX_REQUESTS) {
    ev.push(['tap']);
    for (const t of w.timers.keys()) ev.push(['fire', t]);
  }
  for (const f of w.inflight.keys()) ev.push(['ok', f], ['fail', f]);
  return ev;
}

async function apply(w, [kind, n]) {
  const shownBefore = w.shownSeq();
  if (kind === 'tap') w.clicks.forEach((fn) => fn({ type: 'click' }));
  if (kind === 'fire') {
    const t = w.timers.get(n);
    w.timers.delete(n);
    t.fn();
  }
  if (kind === 'ok') {
    w.inflight.get(n).ok({ ok: true, status: 200, json: async () => forecast(n) });
    w.inflight.delete(n);
    w.okSeqs.push(n);
  }
  if (kind === 'fail') {
    w.inflight.get(n).fail(new TypeError('Failed to fetch'));
    w.inflight.delete(n);
  }
  await settle();
  const shownAfter = w.shownSeq();
  if (!w.wentBack && shownBefore !== null && shownAfter !== null && shownAfter < shownBefore)
    w.wentBack = `the panel went from request #${shownBefore}'s forecast back to request #${shownAfter}'s`;
}

function describeState(w) {
  const timers = [...w.timers].map(([t, { ms }]) => `T${t} (${ms >= 60000 ? ms / 60000 + ' min' : ms + ' ms'})`).join(', ') || 'none';
  const inflight = [...w.inflight.keys()].map((f) => '#' + f).join(', ') || 'none';
  const shown = w.shownSeq();
  return `timers: ${timers}; in flight: ${inflight}; panel: ${shown === null ? 'empty' : shown === 0 ? 'cached forecast' : `forecast #${shown}`}; status: "${w.els.status?.textContent ?? ''}"`;
}

function describeStep([kind, n], before, after) {
  const newReq = after.requests > before.requests ? ` -> refreshWeather() starts request #${after.requests}` : '';
  const newTimers = [...after.timers.keys()].filter((t) => !before.timers.has(t)).map((t) => `T${t}`);
  const cleared = [...before.timers.keys()].filter((t) => !after.timers.has(t) && !(kind === 'fire' && t === n)).map((t) => `T${t}`);
  const sched = newTimers.length ? `; schedules ${newTimers.join(', ')}` : '';
  const clr = cleared.length ? `; clears ${cleared.join(', ')}` : '';
  const what = { tap: 'user taps the frame', fire: `timer T${n} fires`, ok: `request #${n} returns 200`, fail: `request #${n} fails (offline)` }[kind];
  return `${what}${newReq}${clr}${sched}`;
}

// Two paths that reach the same signature behave the same from there on, so only one is expanded.
// main.js keeps three pieces of hidden state: `weather` (what the panel renders, read back as
// shownSeq), `weatherTimer` (always the id of the last setTimeout call, since every call's result
// is assigned to it: timerSeq) and `loadedVersion` (constant here). The rest is observable.
// Ids only matter by identity and order, so timers and requests are renumbered by rank: the code
// compares timer ids only through clearTimeout(weatherTimer), and request numbers only feed the
// forecast content, where the properties compare them by order.
function signature(w) {
  const timerIds = [...w.timers.keys()].sort((a, b) => a - b);
  const maxOk = w.okSeqs.length ? Math.max(...w.okSeqs) : null;
  const storeSeq = w.store() ? JSON.parse(w.store()).current.temperature_2m : null;
  const seqs = [...new Set([...w.inflight.keys(), maxOk, w.shownSeq(), storeSeq].filter((v) => v !== null))].sort((a, b) => a - b);
  const r = (v) => (v === null ? null : seqs.indexOf(v));
  return JSON.stringify([
    w.requests,
    timerIds.map((t) => w.timers.get(t).ms),
    timerIds.indexOf(w.timerSeq),
    [...w.inflight.keys()].map(r).sort(),
    r(maxOk), r(w.shownSeq()), r(storeSeq),
    Boolean(w.wentBack),
    w.els.status?.textContent.replace(/\d\d:\d\d/, 'HH:MM'), w.els.status?.className,
  ]);
}

async function replay(start, path) {
  const w = await makeWorld(start);
  for (const e of path) await apply(w, e);
  return w;
}

async function explore(patch) {
  const found = {};
  let paths = 0;
  for (const cached of [false, true]) {
    const start = { cached, patch };
    const seen = new Set();
    let frontier = [[]];
    while (frontier.length) {
      const next = [];
      for (const path of frontier) {
        const w = await replay(start, path);
        const sig = signature(w);
        if (seen.has(sig)) continue;
        seen.add(sig);
        paths++;
        for (const [name, prop] of Object.entries(PROPERTIES)) {
          const why = prop(w);
          if (why && (!found[name] || found[name].path.length > path.length)) found[name] = { why, path, start };
        }
        for (const e of enabled(w)) next.push([...path, e]);
      }
      frontier = next;
    }
  }
  return { found, paths };
}

async function narrate(name, { why, path, start }, patch) {
  const lines = [`  start: page load with ${start.cached ? 'a cached forecast' : 'no cache'} -> refreshWeather() starts request #1`];
  let w = await makeWorld({ ...start, patch });
  lines.push(`         ${describeState(w)}`);
  for (const [i, e] of path.entries()) {
    const before = { requests: w.requests, timers: new Map(w.timers) };
    await apply(w, e);
    lines.push(`  ${i + 1}. ${describeStep(e, before, w)}`, `         ${describeState(w)}`);
  }
  lines.push(`  broken: ${why}`);
  return lines.join('\n');
}

async function run(patch) {
  const { found, paths } = await explore(patch);
  return { found, paths, result: Object.fromEntries(Object.keys(PROPERTIES).map((p) => [p, found[p] ? 'fail' : 'pass'])) };
}

if (!existsSync(join(SRC, 'main.js'))) throw new Error(`no main.js in ${SRC}`);
const t0 = Date.now();

if (args.includes('--mutants')) {
  // Each property must be seen failing on a broken variant and passing on a fixed one.
  const mutants = JSON.parse(readFileSync(join(HERE, 'mutants.json'), 'utf8'));
  let bad = 0;
  for (const m of mutants) {
    const { result } = await run(m.patch);
    const miss = Object.entries(m.expect).filter(([p, v]) => result[p] !== v);
    console.log(`${miss.length ? 'MISS' : 'ok  '} ${m.name}: ${Object.entries(m.expect).map(([p, v]) => `${p}=${result[p]} (want ${v})`).join(', ')}`);
    bad += miss.length;
  }
  console.log(`${mutants.length} mutants in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(bad ? 1 : 0);
}

const { found, paths, result } = await run();
if (args.includes('--json')) {
  console.log(JSON.stringify({ maxRequests: MAX_REQUESTS, paths, result }, null, 2));
} else {
  console.log(`frame-app refresh loop, up to ${MAX_REQUESTS} Open-Meteo requests, ${paths} distinct states in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  for (const name of Object.keys(PROPERTIES)) {
    const want = EXPECTED[name];
    const tag = result[name] === want ? (want === 'fail' ? 'KNOWN' : 'PASS ') : 'NEW  ';
    console.log(`${tag} ${name}: ${result[name]}${want !== result[name] ? ` (baseline says ${want})` : ''}`);
    if (found[name]) console.log(await narrate(name, found[name]));
  }
}
const changed = Object.keys(PROPERTIES).filter((p) => result[p] !== EXPECTED[p]);
if (changed.length && !args.includes('--json')) console.log(`\nResult differs from expected.json for: ${changed.join(', ')}`);
process.exit(changed.length ? 1 : 0);
