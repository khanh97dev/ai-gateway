// AI token tester. Keys stay server-side (keys.json). Run: node server.mjs  ->  http://localhost:8787
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const keys = JSON.parse(await readFile(new URL('./keys.json', import.meta.url)));
const PORT = 8787;

// --- provider adapters: {chat(model,prompt), models(), health()} ---
const providers = {
  openrouter: {
    base: 'https://openrouter.ai/api/v1',
    async models() {
      const r = await (await fetch(`${this.base}/models`)).json();
      return r.data.filter(m => m.id.endsWith(':free')).map(m => m.id).sort();
    },
    async chat(model, prompt) {
      const res = await fetch(`${this.base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${keys.openrouter}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return { text: j.choices[0].message.content, model: j.model, tokens: j.usage?.total_tokens ?? 0 };
    },
    health() { return this.chat('apodex/apodex-1.1-mini:free', 'ping').then(() => 'OK'); },
  },
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta',
    async models() { return ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash']; },
    async chat(model, prompt) {
      const res = await fetch(`${this.base}/models/${model}:generateContent?key=${keys.gemini}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const j = await res.json();
      if (j.error) throw new Error(`${j.error.code} ${j.error.message}`);
      return { text: j.candidates[0].content.parts[0].text, model, tokens: j.usageMetadata?.totalTokenCount ?? 0 };
    },
    health() { return this.chat('gemini-2.0-flash', 'ping').then(() => 'OK'); },
  },
};

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('./index.html', import.meta.url)));
    }
    if (u.pathname === '/api/providers') return json(res, 200, Object.keys(providers));
    if (u.pathname === '/api/health') {
      const out = {};
      await Promise.all(Object.entries(providers).map(async ([name, p]) => {
        try { out[name] = { ok: true, status: await p.health() }; }
        catch (e) { out[name] = { ok: false, status: e.message.slice(0, 120) }; }
      }));
      return json(res, 200, out);
    }
    if (u.pathname === '/api/models') {
      const p = providers[u.searchParams.get('provider')];
      if (!p) return json(res, 400, { error: 'unknown provider' });
      try { return json(res, 200, await p.models()); } catch (e) { return json(res, 200, []); }
    }
    if (u.pathname === '/api/chat' && req.method === 'POST') {
      const { provider, model, prompt } = await readBody(req);
      const p = providers[provider];
      if (!p) return json(res, 400, { error: 'unknown provider' });
      try { return json(res, 200, await p.chat(model, prompt)); }
      catch (e) { return json(res, 200, { error: e.message }); }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`AI token tester -> http://localhost:${PORT}`));
