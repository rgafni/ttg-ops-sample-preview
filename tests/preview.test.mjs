// Sample-preview checks: forced fictional mode, no backend or storage, whitelist and privacy scan, relative assets.
import assert from 'assert';
import vm from 'vm';
import { readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { boot, flush, read, root } from './harness.mjs';
const tests = []; const test = (n, f) => tests.push([n, f]);
const KEY = 'K'.repeat(32);
const ROUTES = ['#/', '#/review', '#/students', '#/notes', '#/providers', '#/providers/schedules', '#/billing', '#/reports', '#/email', '#/settings', '#/search'];
async function allRoutes(t) {
  const out = {}, P = t.app.S.P;
  const dyn = [...P.students.map(s => '#/student/' + s.id), ...P.providers.map(p => '#/provider/' + p.key), ...P.queue.map(q => '#/item/' + q.id), ...P.reports.map(r => '#/report/' + r.id)];
  for (const r of [...ROUTES, ...dyn]) { await t.go(r); out[r] = t.html; }
  for (const n of (t.app.S.clinical && t.app.S.clinical.notes) || []) { await t.go('#/note/' + n.id); out['#/note/' + n.id] = t.html; }
  for (const b of (t.app.S.billing && t.app.S.billing.batches) || []) { await t.go('#/billing/' + encodeURIComponent(b.id)); out['#/billing/' + b.id] = t.html; }
  return out;
}
const FIELDS = { caseNote: 'x note', reqText: 'please', qSubject: 's', qMessage: 'm', srBody: 'b', flagReason: 'wrong provider', flagLine: '', clearReason: 'fixed now', editField: 'Why', editValue: 'v', mrStudent: '', mrMonth: '2026-10', mrProvider: 'Morgan Lane' };

for (const [label, search] of [['no query', ''], ['?fixtures=0', '?fixtures=0'], ['?k= in query', '?k=' + KEY]]) {
  test('forced fictional mode with a stored key and API, ' + label + ': zero network, storage or script loads on every route and action', async () => {
    const t = boot({ search, key: KEY, api: 'https://script.google.com/macros/s/OTHER/exec', preloadFixtures: true, fields: FIELDS });
    await flush();
    assert.equal(t.app.S.mode, 'fixture');
    const pages = await allRoutes(t);
    assert.ok(Object.keys(pages).length > 20, 'routes rendered: ' + Object.keys(pages).length);
    const P = t.app.S.P, a = P.students[0];
    await t.act('case-note', { 'data-id': a.id }); await t.act('case-edit', { 'data-id': a.id }); await t.act('req-add', { 'data-case': '' });
    await t.act('q', { 'data-op': 'approve', 'data-id': P.queue[0].id }); await t.act('rep-create'); await t.act('rep-save');
    const b = t.app.S.billing.batches[0]; await t.act('bill-flag', { 'data-batch': b.id }); await t.act('forget-key');
    assert.equal(t.fetches.length, 0, 'network call made');
    assert.deepStrictEqual(t.scripts, []);
    assert.deepStrictEqual(t.setItems, []);
    assert.equal(t.store['ttgops.k'], KEY, 'preview must not touch stored keys either');
    for (const [r, h] of Object.entries(pages)) {
      assert.ok(h.includes('Fictional sample data · sample preview, no real data'), 'no fictional banner on ' + r);
      assert.ok(!/gateKey|gateApi|type="password"|Admin key|admin link/i.test(h), 'credential UI on ' + r);
      assert.ok(!/Forget key|Leave preview/.test(h), 'live-only control on ' + r);
    }
    assert.ok(t.toasts.some(x => /preview/i.test(x)), 'actions should say preview/not saved');
  });
}
test('preview app.js has no live path: no fetch, no key read, no service worker, gate never collects input', () => {
  const s = read('app.js');
  assert.ok(!/fetch\(|serviceWorker|localStorage\.(getItem|setItem)|TTG_CONFIG|script\.google/.test(s));
  assert.ok(s.includes('var FIXTURE = true;'));
  const t = boot({ key: KEY, preloadFixtures: true });
  t.app.gate && t.app.gate('key');
});
test('boot.js only handles layout (ignores ?k= / #k= / api=)', () => {
  const sets = [], reps = [];
  const sb = vm.createContext({ document: { documentElement: { classList: { toggle() {} } } }, window: { innerWidth: 400, addEventListener() {} },
    location: { href: 'https://x.github.io/p/?k=' + KEY + '#k=' + KEY + '&api=AKfy', hash: '#k=' + KEY }, localStorage: { setItem: k => sets.push(k), getItem: () => null, removeItem() {} },
    history: { replaceState: () => reps.push(1) }, URL, URLSearchParams });
  sb.window.document = sb.document; vm.runInContext(read('boot.js').replace(/window\.addEventListener/g, 'window.addEventListener'), sb);
  assert.deepStrictEqual(sets, []); assert.deepStrictEqual(reps, []);
});
const WHITELIST = ['.nojekyll', 'README.md', 'app.css', 'app.js', 'billing-core.js', 'boot.js', 'fixtures/fake-api.js', 'fixtures/v4-sample.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'index.html', 'model.js', 'package.json', 'tests/harness.mjs', 'tests/preview.test.mjs', 'PREVIEW_SOURCE.txt'].sort();
function walk(d, base = '') { return readdirSync(d).flatMap(f => { if (f === '.git' || f === 'node_modules') return []; const p = path.join(d, f), r = base ? base + '/' + f : f; return statSync(p).isDirectory() ? walk(p, r) : [r]; }); }
test('file whitelist is exact (no config, service worker, manifest, installer, backend, docs)', () => {
  assert.deepStrictEqual(walk(root).sort(), WHITELIST);
});
test('privacy scan: no endpoints, IDs, keys, private emails or staff/account names', () => {
  const banned = ['script' + '\\.google', 'AKfy', 'AI' + 'za', 'sk-[A-Za-z0-9]{10}', 'spreadsheets' + '\\/d\\/', '\\b1[A-Za-z0-9_-]{43}\\b', 'gm' + 'ail\\.com', 'togethertheygrow',
    'Nina' + ' Fisher', 'El' + 'lie', 'rgafni' + '84', 'ttg-ops-admin', '/workspace', 'ensora-export', '[0-9a-f]{64}', 'Bearer ', 'ghp_', 'gho_'];
  for (const f of walk(root).filter(f => !/\.png$|preview\.test\.mjs$/.test(f))) {
    const s = read(f); const m = s.match(new RegExp(banned.join('|'))); assert.ok(!m, f + ': ' + (m && m[0]));
    for (const e of s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []) assert.ok(/@example\.com$/.test(e), f + ' email ' + e);
  }
});
test('index.html: every asset is relative and exists (works under a /<repo>/ subpath), CSP blocks connections', () => {
  const h = read('index.html');
  const refs = [...h.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 8);
  for (const r of refs) { assert.ok(!/^(\/|https?:|\/\/)/.test(r), 'not relative: ' + r); assert.ok(existsSync(path.join(root, r.split('?')[0])), 'missing ' + r); }
  assert.ok(/connect-src 'none'/.test(h) && /form-action 'none'/.test(h));
  assert.ok(!/manifest|sw\.js|install\.js|config\.js/.test(h));
});
test('syntax: every JS file parses', () => { for (const f of walk(root).filter(f => /\.js$/.test(f))) new vm.Script(read(f), { filename: f }); });

let pass = 0, fail = 0;
for (const [n, f] of tests) { try { await f(); pass++; console.log('ok ' + n); } catch (e) { fail++; console.log('FAIL ' + n + '\n  ' + (e && e.message)); } }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
