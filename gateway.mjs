// Multi-agent gateway over OpenRouter. Run: OPENROUTER_API_KEY=... node gateway.mjs "your task"
const KEY = process.env.OPENROUTER_API_KEY;
const URL = 'https://openrouter.ai/api/v1';
if (!KEY) { console.error('Set OPENROUTER_API_KEY'); process.exit(1); }

let FREE = [];
async function freeModels() {
  if (FREE.length) return FREE;
  const r = await (await fetch(`${URL}/models`)).json();
  FREE = r.data.filter(m => m.id.endsWith(':free')).map(m => m.id);
  return FREE;
}

// One gateway call. `models` = fallback list (max 3, enforced by OpenRouter).
async function call(messages, { models, temperature = 0.4 } = {}) {
  const pool = (models || await freeModels()).slice(0, 3);
  const res = await fetch(`${URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: pool[0], models: pool, messages, temperature }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return { text: j.choices[0].message.content.trim(), model: j.model, tokens: j.usage?.total_tokens ?? 0 };
}

const agent = (system, user, opts) => call([{ role: 'system', content: system }, { role: 'user', content: user }], opts);

async function orchestrate(task) {
  const models = await freeModels();
  const pool = models.slice(0, 3);            // every subagent shares the same fallback pool
  const log = m => console.log(m);

  // 1. Planner: split into 2-3 subtasks
  log('\n[planner] breaking down task...');
  const plan = await agent(
    'You are a planner. Break the task into 2-3 independent subtasks. Reply ONLY as a JSON array of short strings.',
    task, { models: pool, temperature: 0.2 });
  let subtasks;
  try { subtasks = JSON.parse(plan.text.match(/\[[\s\S]*\]/)[0]); }
  catch { subtasks = [task]; }
  log(`[planner] (${plan.model}) -> ${JSON.stringify(subtasks)}`);

  // 2. Workers: answer each subtask in parallel
  log('\n[workers] running in parallel...');
  const results = await Promise.all(subtasks.map(async (st, i) => {
    const r = await agent('You are a focused specialist. Answer the subtask concisely and factually.', st, { models: pool });
    log(`  [worker ${i}] (${r.model}) ${st} -> ${r.text.slice(0, 80).replace(/\n/g, ' ')}...`);
    return `### ${st}\n${r.text}`;
  }));

  // 3. Synthesizer: merge into final answer
  log('\n[synth] combining...');
  const final = await agent(
    'You are a synthesizer. Merge the specialist findings into one coherent answer. Be concise.',
    `Task: ${task}\n\nFindings:\n${results.join('\n\n')}`, { models: pool });
  log(`[synth] (${final.model})`);
  return final.text;
}

// self-check: the call path works end to end
async function selfCheck() {
  const r = await agent('Reply with exactly: OK', 'ping', { temperature: 0 });
  if (!/ok/i.test(r.text)) throw new Error('self-check failed: ' + r.text);
  console.log(`[self-check] gateway OK via ${r.model}`);
}

const task = process.argv.slice(2).join(' ');
if (task === '--check') { await selfCheck(); }
else {
  await selfCheck();
  const out = await orchestrate(task || 'Explain what an AI gateway is and give one concrete use case.');
  console.log('\n===== FINAL =====\n' + out);
}
