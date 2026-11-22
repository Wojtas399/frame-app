#!/usr/bin/env node
// Drive the headless Chrome that launch.sh started, over the Chrome DevTools Protocol.
// Usage: cdp.mjs <RUN> <command> [args] [-- <command> [args] ...]
// Commands run in order over one CDP session. `offline` and `block` last only for that session,
// so chain them with the steps that need them.
//
//   open <path|url>              navigate (a path is relative to the app URL), wait for load
//   wait <js-expr> [timeoutMs]   poll until the expression is truthy (default 10000 ms)
//   eval <js-expr>               print the JSON value of the expression
//   tap <css-selector>           real mouse press+release at the element's centre
//   type <css-selector> <text>   tap the element, then type the text into it (fires `input` events)
//   text [file]                  innerText of the page, i.e. the visible view (to stdout, or a file under evidence/)
//   screenshot <file>            PNG of the 1280x800 viewport, saved under evidence/
//   offline on|off               emulate the frame losing / regaining the network
//   block <url-pattern>          fail requests matching the pattern (e.g. '*api.open-meteo.com*')
//   sleep <ms>
//
// Every request to api.open-meteo.com, version.json and a calendar feed (an Apps Script URL or a
// fixtures/ file) is appended to evidence/network.log, and console messages and page errors to
// evidence/console.log.
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

const [run, ...rest] = process.argv.slice(2);
if (!run || !rest.length) {
  console.error('usage: cdp.mjs <RUN> <command> [args] [-- <command> ...]');
  process.exit(2);
}
const env = Object.fromEntries(
  readFileSync(join(run, 'state/env'), 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const evidence = join(run, 'evidence');
const out = (f) => {
  const p = isAbsolute(f) ? f : join(evidence, f);
  mkdirSync(dirname(p), { recursive: true });
  return p;
};
const steps = [[]];
for (const a of rest) a === '--' ? steps.push([]) : steps.at(-1).push(a);

const targets = await (await fetch(`http://127.0.0.1:${env.CDP_PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target in Chrome');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)));

let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method) listeners.forEach((l) => l(msg));
};
const send = (method, params = {}) =>
  new Promise((ok, fail) => {
    pending.set(++id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method) => new Promise((ok) => listeners.push((m) => m.method === method && ok(m.params)));
const stamp = () => new Date().toISOString();

const secret = (url) => /script\.google|googleusercontent/.test(url);
const logged = (url) => (secret(url) ? `${new URL(url).origin}/… (feed URL hidden)` : url);
const watched = (url) => /api\.open-meteo\.com|version\.json|script\.google|googleusercontent|\/fixtures\//.test(url);
listeners.push(({ method, params }) => {
  if (method === 'Network.requestWillBeSent' && watched(params.request.url))
    appendFileSync(out('network.log'), `${stamp()} REQ  ${params.requestId} ${logged(params.request.url)}\n`);
  if (method === 'Network.responseReceived' && watched(params.response.url))
    appendFileSync(out('network.log'), `${stamp()} RESP ${params.requestId} ${params.response.status}\n`);
  if (method === 'Network.loadingFailed')
    appendFileSync(out('network.log'), `${stamp()} FAIL ${params.requestId} ${params.errorText}${params.blockedReason ? ` (${params.blockedReason})` : ''}\n`);
  if (method === 'Runtime.consoleAPICalled')
    appendFileSync(out('console.log'), `${stamp()} ${params.type} ${params.args.map((a) => a.value ?? a.description ?? '').join(' ')}\n`);
  if (method === 'Runtime.exceptionThrown')
    appendFileSync(out('console.log'), `${stamp()} EXCEPTION ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}\n`);
});

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};

const commands = {
  async open(target) {
    const url = /^https?:/.test(target) ? target : new URL(target.replace(/^\//, ''), env.APP_URL).href;
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url });
    await loaded;
  },
  async wait(expr, timeout = '10000') {
    const end = Date.now() + Number(timeout);
    for (;;) {
      try {
        if (await evaluate(expr)) return;
      } catch {}
      if (Date.now() > end) throw new Error(`timed out after ${timeout} ms waiting for: ${expr}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  },
  async eval(expr) {
    console.log(JSON.stringify(await evaluate(expr)));
  },
  async tap(selector) {
    const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`no element matches ${selector}`);
    const ev = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...ev });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...ev });
  },
  async type(selector, text) {
    await commands.tap(selector);
    await send('Input.insertText', { text });
  },
  async text(file) {
    const t = await evaluate('document.body.innerText');
    file ? writeFileSync(out(file), t + '\n') : console.log(t);
  },
  async screenshot(file) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out(file), Buffer.from(data, 'base64'));
    console.log(out(file));
  },
  async offline(state) {
    const off = state === 'on';
    await send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  },
  async block(pattern) {
    await send('Network.setBlockedURLs', { urls: [pattern] });
  },
  async sleep(ms) {
    await new Promise((r) => setTimeout(r, Number(ms)));
  },
};

let code = 0;
try {
  for (const [name, ...args] of steps) {
    if (!commands[name]) throw new Error(`unknown command: ${name}`);
    await commands[name](...args);
  }
} catch (e) {
  console.error(e.message);
  code = 1;
}
ws.close();
process.exit(code);
