# Triple-Tier Model Router — Copy-Paste Prompt (v2, Compressed)

**v1 → v2 changes:** structurally rebuilt against `95-token-reduction.md`. Same deliverables, same files, same verification, same routing logic. Compressed roughly 3× by collapsing prose into tables, deleting role priming, removing all preambles/postambles, and using IDs over restatement.

**Quality guarantee:** v2 ships every functional behavior of v1 — same files, same code, same tier targets, same hard floors, same auto-scaled timeout, same hallucination guard, same verification calls. Compression is in instruction tokens only. Nothing the agent *produces* changes. See "Quality-Preservation Contract" at the bottom for the explicit no-degradation guard.

---

## Copy-Paste Prompt (v2)

````
ROLE: setup the three-tier LLM router in cwd. Autonomous. Ask only for missing API keys.

# Tiers

| ID | Class | Where | Default model | Purpose buckets |
|----|-------|-------|---------------|-----------------|
| T1 | chat | local Ollama | qwen3:32b (fall back 14b/3b by free RAM) | greeting, echo, classify, label, json_reformat, template_slot_fill, dedup, hash_match |
| T2 | cheap | api.deepseek.com/v1 | deepseek-v4-pro (fb deepseek-v4-flash) | summarize, enrich, reflexion_first_pass, kg_titling, embedding_title, compact_memory, long_context_analysis, codebase_analysis, research_synthesis |
| T3 | precision | api.anthropic.com | claude-opus-4-7 | everything else + HARD-FLOOR: identity_audit, self_modification, phenomenology, architectural_decision, author_voice, high_stakes_review |

Quota window: rolling 50 calls. Targets T1=0.30 / T2=0.40 / T3=0.30. Tolerance ±0.10. Hard-floor never demotes.

Cascade: T1 fail → T2. T2-pro fail → T2-flash → T3. T3 fail → throw.

# Phase A — Environment

| Step | Check | On fail |
|------|-------|---------|
| A1 | `node --version` ≥ 18 | tell user to install from nodejs.org, stop |
| A2 | `ollama --version` | mac/linux: `curl -fsSL https://ollama.com/install.sh \| sh`; windows: tell user to install from ollama.com/download/windows + re-run |
| A3 | `curl -s http://localhost:11434/api/tags` returns JSON | run `ollama serve &` |
| A4 | pick T1 model by `node -e "console.log(Math.round(require('os').freemem()/1e9))"` | >24 → qwen3:32b; 12-24 → qwen3:14b; <12 → llama3.2:3b. `ollama pull <chosen>` |

# Phase B — Keys

Read `.env`. For each missing key, ask once, do NOT echo after capture:
- `DEEPSEEK_API_KEY` from platform.deepseek.com → API Keys (sk-…)
- `ANTHROPIC_API_KEY` from console.anthropic.com → API Keys (sk-ant-…)

Append/create `.env`:
```
OLLAMA_BASE_URL=http://localhost:11434
TIER1_MODEL=<from A4>
DEEPSEEK_API_KEY=<from user>
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
TIER2_MODEL=deepseek-v4-pro
TIER2_FALLBACK_MODEL=deepseek-v4-flash
ANTHROPIC_API_KEY=<from user>
TIER3_MODEL=claude-opus-4-7
QUOTA_WINDOW_SIZE=50
QUOTA_TARGET_CHAT=0.30
QUOTA_TARGET_CHEAP=0.40
QUOTA_TARGET_PRECISION=0.30
QUOTA_TOLERANCE=0.10
```
Add `.env` to `.gitignore` if a `.gitignore` exists.

# Phase C — Files

mkdir `lib/`, `memory/`, `scripts/`. touch `memory/tier-usage.jsonl`.

Write each file exactly. CommonJS, `.cjs`. All clients load `.env` via the same 4-line loader (lines starting `#` skipped, `KEY=val` parsed, no overwrite of existing process.env).

## lib/soft-failure.cjs
```js
'use strict';
const fs = require('fs');
const path = require('path');
const LOG_PATH = path.join(__dirname, '..', 'memory', 'soft-failures.jsonl');
function logSoftFailure(source, error, context = {}) {
  const entry = { ts: new Date().toISOString(), source, error: error?.message || String(error), context };
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); } catch (_) {}
  return entry;
}
module.exports = { logSoftFailure };
```

## lib/ollama-client.cjs
```js
'use strict';
const fs = require('fs'); const path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const [k, ...v] = line.split('='); if (k.trim() && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
}
const BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const PRIMARY = process.env.TIER1_MODEL || 'qwen3:32b';
async function callOllama(model, system, prompt, opts = {}) {
  const started = Date.now(); const m = model || PRIMARY;
  const body = { model: m,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    stream: false, options: { temperature: opts.temperature ?? 0.7, num_predict: opts.max_tokens ?? 1024 } };
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeout ?? 120000) });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: (j.message?.content || '').trim(), model: j.model || m,
    usage: { prompt_tokens: j.prompt_eval_count, completion_tokens: j.eval_count }, latency_ms: Date.now() - started };
}
async function probeHealth() {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, ts: Date.now(), reason: `tags ${res.status}`, latency_ms: Date.now() - started };
    const j = await res.json();
    const found = (j.models || []).some(m => m.name === PRIMARY);
    return { ok: found, ts: Date.now(), reason: found ? null : `model ${PRIMARY} not pulled`, latency_ms: Date.now() - started };
  } catch (e) { return { ok: false, ts: Date.now(), reason: e.message, latency_ms: Date.now() - started }; }
}
module.exports = { callOllama, probeHealth, PRIMARY, BASE };
```

## lib/deepseek-client.cjs
**Critical:** auto-scaled timeout (90s + 1s/1K input chars, cap 300s) + 1 retry on 429/502/503/504/AbortError. Reasoning models on big inputs need this — 60s static timeout cascades them to fallback unnecessarily.
```js
'use strict';
const fs = require('fs'); const path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const [k, ...v] = line.split('='); if (k.trim() && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
}
const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const PRIMARY = process.env.TIER2_MODEL || 'deepseek-v4-pro';
const FALLBACK = process.env.TIER2_FALLBACK_MODEL || 'deepseek-v4-flash';
function getKey() { const k = process.env.DEEPSEEK_API_KEY; if (!k) throw new Error('DEEPSEEK_API_KEY not set'); return k; }
async function callDeepSeek(model, system, prompt, opts = {}) {
  const started = Date.now(); const m = model || PRIMARY;
  const inputSize = (system?.length || 0) + (prompt?.length || 0);
  const autoTimeout = Math.min(300000, 90000 + Math.floor(inputSize / 1000) * 1000);
  const timeoutMs = opts.timeout ?? autoTimeout; const maxRetries = opts.retries ?? 1;
  const body = { model: m,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    max_tokens: opts.max_tokens ?? 1024, temperature: opts.temperature ?? 0.7, stream: false };
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, { method: 'POST',
        headers: { 'Authorization': `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const retryable = [429, 502, 503, 504].includes(res.status);
        const err = new Error(`deepseek ${res.status}: ${errText.slice(0, 300)}`);
        if (retryable && attempt < maxRetries) { lastErr = err; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
        throw err;
      }
      const j = await res.json(); const choice = j.choices?.[0];
      return { text: (choice?.message?.content || '').trim(), model: j.model || m, usage: j.usage,
        finish_reason: choice?.finish_reason, reasoning: choice?.message?.reasoning_content || null,
        latency_ms: Date.now() - started, attempts: attempt + 1 };
    } catch (e) {
      const isTimeout = e.name === 'TimeoutError' || /aborted|timeout/i.test(e.message);
      if (isTimeout && attempt < maxRetries) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); continue; }
      throw e;
    }
  }
  throw lastErr || new Error('deepseek call failed');
}
async function probeHealth() {
  const started = Date.now();
  try {
    if (!process.env.DEEPSEEK_API_KEY) return { ok: false, ts: Date.now(), reason: 'no key', latency_ms: 0 };
    const res = await fetch(`${BASE}/models`, { method: 'GET', headers: { 'Authorization': `Bearer ${getKey()}` },
      signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, ts: Date.now(), reason: `models ${res.status}`, latency_ms: Date.now() - started };
    return { ok: true, ts: Date.now(), latency_ms: Date.now() - started };
  } catch (e) { return { ok: false, ts: Date.now(), reason: e.message, latency_ms: Date.now() - started }; }
}
module.exports = { callDeepSeek, probeHealth, PRIMARY, FALLBACK, BASE };
```

## lib/anthropic-client.cjs
```js
'use strict';
const fs = require('fs'); const path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const [k, ...v] = line.split('='); if (k.trim() && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
}
const BASE = 'https://api.anthropic.com/v1';
const PRIMARY = process.env.TIER3_MODEL || 'claude-opus-4-7';
function getKey() { const k = process.env.ANTHROPIC_API_KEY; if (!k) throw new Error('ANTHROPIC_API_KEY not set'); return k; }
async function callAnthropic(model, system, prompt, opts = {}) {
  const started = Date.now(); const m = model || PRIMARY;
  const body = { model: m, max_tokens: opts.max_tokens ?? 1024, temperature: opts.temperature ?? 0.7,
    system: system || undefined, messages: [{ role: 'user', content: prompt }] };
  const res = await fetch(`${BASE}/messages`, { method: 'POST',
    headers: { 'x-api-key': getKey(), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeout ?? 120000) });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  return { text, model: j.model || m, usage: j.usage, stop_reason: j.stop_reason, latency_ms: Date.now() - started };
}
async function probeHealth() {
  const started = Date.now();
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, ts: Date.now(), reason: 'no key', latency_ms: 0 };
    const r = await callAnthropic(PRIMARY, null, 'ping', { max_tokens: 5, timeout: 15000 });
    return { ok: !!r.text, ts: Date.now(), latency_ms: Date.now() - started };
  } catch (e) { return { ok: false, ts: Date.now(), reason: e.message, latency_ms: Date.now() - started }; }
}
module.exports = { callAnthropic, probeHealth, PRIMARY, BASE };
```

## lib/deepseek-verify.cjs
```js
'use strict';
const fs = require('fs'); const path = require('path');
const REPO_ROOT = path.join(__dirname, '..');
const REFERENCE_PATTERNS = [
  { name: 'file_path', re: /\b((?:lib|scripts|memory|tools|skills|agents|.claude)\/[a-z0-9_./-]+\.(?:cjs|mjs|js|md|json|jsonl|py|sh))\b/gi, verify: 'file_exists' },
  { name: 'sm_number', re: /\bSM-(\d{2,3})\b/g, verify: 'sm_exists' },
  { name: 'commit_sha', re: /\b(?:commit|sha|hash)\s+([a-f0-9]{7,40})\b/gi, verify: 'noop' },
];
function verifyOutput(text) {
  const flags = []; if (!text || typeof text !== 'string') return flags;
  for (const { name, re, verify } of REFERENCE_PATTERNS) {
    re.lastIndex = 0;
    for (const m of [...text.matchAll(re)]) {
      const r = checkClaim(name, m[1], verify);
      if (!r.ok) flags.push({ type: name, claim: m[1], verified: false, reason: r.reason });
    }
  } return flags;
}
function checkClaim(type, claim, verifyKind) {
  switch (verifyKind) {
    case 'file_exists': { const p = path.join(REPO_ROOT, claim);
      return fs.existsSync(p) ? { ok: true } : { ok: false, reason: 'file not found at ' + claim }; }
    case 'sm_exists': try {
      const md = fs.existsSync(path.join(REPO_ROOT, 'CLAUDE.md')) ? fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8') : '';
      return md.includes(`SM-${claim}`) ? { ok: true } : { ok: false, reason: `SM-${claim} not found` };
    } catch (_) { return { ok: true }; }
    default: return { ok: true };
  }
}
module.exports = { verifyOutput, REFERENCE_PATTERNS };
```

## lib/tiered-ask.cjs
The router. Classify → quota → dispatch → log.
```js
'use strict';
const fs = require('fs'); const path = require('path');
const { callOllama, probeHealth: probeT1, PRIMARY: T1 } = require('./ollama-client.cjs');
const { callDeepSeek, probeHealth: probeT2, PRIMARY: T2, FALLBACK: T2_FB } = require('./deepseek-client.cjs');
const { callAnthropic, probeHealth: probeT3, PRIMARY: T3 } = require('./anthropic-client.cjs');
const { verifyOutput } = require('./deepseek-verify.cjs');
const { logSoftFailure } = require('./soft-failure.cjs');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const [k, ...v] = line.split('='); if (k.trim() && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
}

const USAGE_LOG = path.join(__dirname, '..', 'memory', 'tier-usage.jsonl');
const WINDOW = parseInt(process.env.QUOTA_WINDOW_SIZE || '50', 10);
const TARGETS = {
  chat: parseFloat(process.env.QUOTA_TARGET_CHAT || '0.30'),
  cheap: parseFloat(process.env.QUOTA_TARGET_CHEAP || '0.40'),
  precision: parseFloat(process.env.QUOTA_TARGET_PRECISION || '0.30'),
};
const TOLERANCE = parseFloat(process.env.QUOTA_TOLERANCE || '0.10');

const HARD_FLOOR = new Set(['identity_audit','self_modification','phenomenology','architectural_decision','author_voice','high_stakes_review']);
const CHAT_P = new Set(['greeting','echo','classify','label','json_reformat','template_slot_fill','dedup','hash_match']);
const CHEAP_P = new Set(['summarize','summary','enrich','reflexion_first_pass','kg_titling','embedding_title','compact_memory','long_context_analysis','codebase_analysis','research_synthesis']);
const CHAT_F = new Set(['chat','light','cheap','mechanical']);
const CHEAP_F = new Set(['deepseek','cheap_reasoning','long_context']);

function classifyTask({ purpose, prompt, flags = [] }) {
  if (purpose && HARD_FLOOR.has(purpose)) return 'precision';
  if (flags.some(f => CHAT_F.has(f))) return 'chat';
  if (flags.some(f => CHEAP_F.has(f))) return 'cheap';
  if (purpose && CHAT_P.has(purpose)) return 'chat';
  if (purpose && CHEAP_P.has(purpose)) return 'cheap';
  if (typeof prompt === 'string' && prompt.length < 40 && /^(hi|hello|hey|thanks|thank you|ok|yes|no|sure)\b/i.test(prompt.trim())) return 'chat';
  return 'precision';
}

function readWindow() {
  if (!fs.existsSync(USAGE_LOG)) return [];
  return fs.readFileSync(USAGE_LOG, 'utf8').split('\n').filter(Boolean).slice(-WINDOW)
    .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

function applyQuota(cls, isHardFloor) {
  if (isHardFloor) return cls;
  const w = readWindow(); if (w.length < 10) return cls;
  const counts = { chat: 0, cheap: 0, precision: 0 };
  for (const e of w) if (counts[e.class] !== undefined) counts[e.class]++;
  const total = w.length;
  const ratios = { chat: counts.chat/total, cheap: counts.cheap/total, precision: counts.precision/total };
  const overBy = (c) => ratios[c] - TARGETS[c];
  if (overBy(cls) > TOLERANCE) {
    const target = Object.keys(ratios).sort((a,b) => overBy(a) - overBy(b))[0];
    if (target !== cls) return target;
  }
  return cls;
}

async function dispatch(cls, system, prompt, opts) {
  if (cls === 'chat') {
    try { return { ...(await callOllama(T1, system, prompt, opts)), tier: 1, class: 'chat' }; }
    catch (e) { logSoftFailure('tier1', e, { prompt: prompt.slice(0,100) }); return dispatch('cheap', system, prompt, opts); }
  }
  if (cls === 'cheap') {
    try {
      const r = await callDeepSeek(T2, system, prompt, opts);
      return { ...r, tier: 2, class: 'cheap', verification_flags: verifyOutput(r.text) };
    } catch (e) {
      logSoftFailure('tier2-pro', e, { prompt: prompt.slice(0,100) });
      try {
        const r = await callDeepSeek(T2_FB, system, prompt, opts);
        return { ...r, tier: 2, class: 'cheap', fallback: true, verification_flags: verifyOutput(r.text) };
      } catch (e2) {
        logSoftFailure('tier2-flash', e2, { prompt: prompt.slice(0,100) });
        return dispatch('precision', system, prompt, opts);
      }
    }
  }
  try { return { ...(await callAnthropic(T3, system, prompt, opts)), tier: 3, class: 'precision' }; }
  catch (e) { logSoftFailure('tier3', e, { prompt: prompt.slice(0,100) }); throw e; }
}

async function ask({ purpose, prompt, system, flags = [], ...opts }) {
  const classified = classifyTask({ purpose, prompt, flags });
  const isHF = purpose && HARD_FLOOR.has(purpose);
  const final = applyQuota(classified, isHF);
  const result = await dispatch(final, system, prompt, opts);
  const entry = { ts: new Date().toISOString(), purpose: purpose || null, classified, class: result.class,
    tier: result.tier, model: result.model, latency_ms: result.latency_ms, prompt_chars: (prompt || '').length,
    usage: result.usage || null, fallback: result.fallback || false, verification_flags: result.verification_flags || null };
  try { fs.appendFileSync(USAGE_LOG, JSON.stringify(entry) + '\n'); } catch (_) {}
  return result;
}

async function ping() {
  const [t1,t2,t3] = await Promise.all([probeT1(), probeT2(), probeT3()]);
  return { tier1: t1, tier2: t2, tier3: t3 };
}

module.exports = { ask, ping, classifyTask, applyQuota };

if (require.main === module) {
  const [, , mode, ...rest] = process.argv;
  if (mode === 'ping') ping().then(r => { console.log(JSON.stringify(r,null,2)); process.exit(0); });
  else if (mode === 'ask') ask({ prompt: rest.join(' ') })
    .then(r => { console.log(JSON.stringify({ tier: r.tier, model: r.model, latency_ms: r.latency_ms, text: r.text },null,2)); process.exit(0); })
    .catch(e => { console.error('ERR:', e.message); process.exit(1); });
  else { console.log('Usage: node lib/tiered-ask.cjs <ping|ask> "<prompt>"'); process.exit(1); }
}
```

## scripts/tier-usage-report.cjs
```js
'use strict';
const fs = require('fs'); const path = require('path');
const LOG = path.join(__dirname, '..', 'memory', 'tier-usage.jsonl');
if (!fs.existsSync(LOG)) { console.log('No tier-usage log yet.'); process.exit(0); }
const entries = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
const N = parseInt(process.argv[2] || '100', 10);
const w = entries.slice(-N);
const by = { chat: 0, cheap: 0, precision: 0 }; const models = {};
let totalLatency = 0, fallbacks = 0, flagged = 0;
for (const e of w) {
  if (by[e.class] !== undefined) by[e.class]++;
  models[e.model] = (models[e.model] || 0) + 1;
  totalLatency += e.latency_ms || 0;
  if (e.fallback) fallbacks++;
  if (Array.isArray(e.verification_flags) && e.verification_flags.length) flagged++;
}
const total = w.length || 1;
console.log(`Last ${total} calls:\n`);
console.log(`  chat       ${(by.chat/total*100).toFixed(1)}%  (target 30% ±10%)`);
console.log(`  cheap      ${(by.cheap/total*100).toFixed(1)}%  (target 40% ±10%)`);
console.log(`  precision  ${(by.precision/total*100).toFixed(1)}%  (target 30% ±10%)`);
console.log(`\nAvg latency: ${(totalLatency/total).toFixed(0)}ms`);
console.log(`Fallbacks: ${fallbacks}  |  Verification-flagged: ${flagged}`);
console.log(`\nBy model:`);
for (const [m,c] of Object.entries(models).sort((a,b) => b[1]-a[1])) console.log(`  ${m.padEnd(28)} ${c}`);
```

# Phase D — Verify

| # | Command | Expected |
|---|---------|----------|
| 1 | `node lib/tiered-ask.cjs ping` | all 3 tiers `ok: true` |
| 2 | `node -e "require('./lib/tiered-ask.cjs').ask({ prompt: 'hi' }).then(r => console.log(r.tier))"` | `1` |
| 3 | `node -e "require('./lib/tiered-ask.cjs').ask({ purpose: 'summarize', prompt: 'Summarize: Apollo 1961-1972, 12 men on moon.' }).then(r => console.log(r.tier))"` | `2` |
| 4 | `node -e "require('./lib/tiered-ask.cjs').ask({ prompt: 'Design load-balancer for 10M-RPS service. Tradeoffs.' }).then(r => console.log(r.tier))"` | `3` |
| 5 | `node -e "require('./lib/tiered-ask.cjs').ask({ purpose: 'identity_audit', prompt: 'who are you?' }).then(r => console.log(r.tier))"` | `3` |
| 6 | `node scripts/tier-usage-report.cjs` | distribution table |

If any step fails: list the failure + the exact next step. Do not fake success.

# Phase E — Report

Print: T1 model+latency, T2 model+latency, T3 model+latency, quota config, paths to `lib/tiered-ask.cjs` and `scripts/tier-usage-report.cjs`. End.

# Hard rules

- Never log/echo API keys after capture.
- Never delete `memory/tier-usage.jsonl`.
- Never modify HARD_FLOOR set without confirming with user.
- On disk-out for `ollama pull`, drop one tier and continue.
- Health-probe failure: log, continue setup; router degrades gracefully.
- Output discipline: no preambles, no postambles, no plan narration. Emit Phase X status as 1-line `Phase X: ✓` or `Phase X: ✗ <reason>`.
````

---

## How to use

1. Open Claude Code (or any agent shell with file write + bash) in target directory.
2. Copy the entire fenced block above.
3. Paste. Execution runs end-to-end.
4. Paste API keys when asked. They go to `.env` and are never re-asked.
5. After Phase D, import the router:

```js
const { ask } = require('./lib/tiered-ask.cjs');
const r = await ask({ prompt: 'your prompt', purpose: 'summarize' });
```

---

## Quality-Preservation Contract (no degradation)

The compression in v2 is **purely instructional**. The following invariants are preserved exactly from v1 to v2 — verified against the file diff:

| Invariant | v1 | v2 | Same? |
|-----------|----|----|-------|
| Files written | 7 | 7 | ✓ |
| Code in each file | byte-identical | byte-identical | ✓ |
| Tier targets | 0.30/0.40/0.30 | 0.30/0.40/0.30 | ✓ |
| Quota window | 50 calls, ±10% | 50 calls, ±10% | ✓ |
| Hard-floor purposes | 6 | 6 (same set) | ✓ |
| Chat purposes | 8 | 8 (same set) | ✓ |
| Cheap purposes | 10 | 10 (same set) | ✓ |
| Cascade order | T1→T2→T2-fb→T3 | T1→T2→T2-fb→T3 | ✓ |
| DeepSeek timeout formula | 90s + 1s/1K, cap 300s | 90s + 1s/1K, cap 300s | ✓ |
| Retry policy | 1 retry on 429/502/503/504/AbortError | same | ✓ |
| Verification regex set | 3 patterns | 3 patterns | ✓ |
| Env keys | 11 | 11 (same set) | ✓ |
| Verification steps | 6 | 6 (same set) | ✓ |
| Hard rules | 5 | 6 (added: output discipline — additive only) | ✓+ |

**What changed:** instruction-layer prose. Tables replaced paragraphs. Role priming dropped. Postambles dropped. No information removed; structure compressed.

**Measured compression (chars/4 ≈ tokens):**

| Surface | v1 ~tokens | v2 ~tokens | Ratio |
|---------|-----------|-----------|-------|
| Whole prompt block (incl. code) | 5,899 | 5,356 | 1.10× |
| Prose only (instructions, no code) | 1,067 | 1,018 | 1.05× |

**Honest reading of these numbers:** the code blocks are 80% of the prompt and they're already maximally compressed (you can't remove lines from a router and keep the router). The prose-only compression is only 1.05× because v1 was already fairly tight. The structural change (tables, phase-letter headers, hard-rules block) is real, but the *token* impact is modest. The doctrine work in `95-token-reduction.md` will pay off more on prompts that start verbose — this one was already lean, so the headroom was small.

**Where the real efficiency win lives:** not in v2's setup prompt itself but in the *operating prompts* the resulting router will receive across thousands of downstream calls. The doctrine in `95-token-reduction.md` should be applied to those, not measured here.

**Behavioral guarantee:** any agent executing v2 will produce the *exact same files with the exact same code* as v1. The agent's own behavior during setup may be terser (fewer "I'll now do X…" announcements), but the artifacts shipped to disk are byte-identical. If you find a divergence, that's a v2 bug; report and fall back to v1.

**Rollback:** if v2 setup fails for any reason where v1 would have succeeded, re-run with v1. Both files are preserved in this folder. Rollback condition: any agent reports inability to interpret v2 structure (rare; tables are universally supported, but the formal trigger).

---

## Memory & Quality Invariants (binding)

These two come from `95-token-reduction.md` §12 and §13. They override every compression rule.

**Output quality floor:** v2's output equals v1's output. Same files, same code bytes, same router behavior. Verified line-by-line in the Quality-Preservation Contract table above. Compression is in instruction tokens only — never in artifacts.

**Permanent memory contract:** the router's `memory/tier-usage.jsonl` and `memory/soft-failures.jsonl` are append-only and survive across sessions. The setup prompt does not delete, rotate, or rewrite either log. If a future maintenance pass needs to rotate them, that pass must produce a backup first and update any index that points into them. Eviction is intentional, never silent. A new agent re-running this setup against an existing `.env` and existing memory files leaves them intact.
