#!/usr/bin/env node
// =============================================================================
// translate-nv.mjs
//
// One-shot, idempotent translation of frontend/src/i18n/en.json into
// frontend/src/i18n/nv.json using the Anthropic (Claude) API.
//
//   Usage:  ANTHROPIC_API_KEY=sk-ant-... node scripts/translate-nv.mjs
//
// Behaviour:
//   - Reads en.json and nv.json
//   - For every leaf string in en.json, checks whether nv.json has a
//     translation AND a matching source hash. If yes, skips. If no,
//     asks Claude to translate just that batch.
//   - Brand terms in DENYLIST never go through the translator — they pass
//     through verbatim (e.g. "Kateri", "Diné", email addresses, URLs).
//   - Writes nv.json with entries in the exact same shape as en.json,
//     plus a companion __meta section at the top that records the source
//     hash + translation model per key so subsequent runs are deterministic.
//
// Design notes:
//   - Navajo is a low-resource language for LLMs. Quality will be mediocre.
//     The UI discloses this with a "machine-generated, pending native
//     speaker review" note attached to the language toggle.
//   - We translate in small batches (20 strings at a time) to keep the
//     prompt short and the response easy to parse back into JSON.
// =============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EN_PATH = path.resolve(__dirname, '../src/i18n/en.json');
const NV_PATH = path.resolve(__dirname, '../src/i18n/nv.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.Anthropic__ApiKey;
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY before running this script.');
  console.error('  e.g. ANTHROPIC_API_KEY=sk-ant-... node scripts/translate-nv.mjs');
  process.exit(1);
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const BATCH_SIZE = 20;

// Brand terms and anything that should never be translated. Passed through
// verbatim in the source-of-truth nv.json.
const DENYLIST = new Set([
  'Kateri',
  'Diné',
  'English',
]);

function isDenylisted(value) {
  if (typeof value !== 'string') return false;
  if (DENYLIST.has(value.trim())) return true;
  // URLs / emails / pure numbers → pass through
  if (/^https?:\/\//i.test(value)) return true;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value)) return true;
  if (/^[\d.,%$€£]+$/.test(value)) return true;
  return false;
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 12);
}

// Walk a nested object, returning an array of { path, value } for every leaf
// string. Path is dot-joined (e.g. "home.heroTitle"). Arrays are flattened
// with numeric indices.
function collectLeaves(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      out.push({ path: keyPath, value });
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      out.push(...collectLeaves(value, keyPath));
    }
  }
  return out;
}

// Write a string into a nested object at a dotted path. Creates intermediate
// objects as needed.
function setLeaf(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof node[part] !== 'object' || node[part] === null || Array.isArray(node[part])) {
      node[part] = {};
    }
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

async function translateBatch(entries) {
  const systemPrompt = [
    "You translate English UI strings for a nonprofit website into Diné bizaad (Navajo).",
    "The site is called Kateri and protects Native American women and girls from sexual abuse and trafficking.",
    "",
    "STRICT RULES:",
    "- Translate only the exact strings provided. Do not add commentary.",
    "- Preserve punctuation, leading/trailing spaces, and any {placeholder} tokens verbatim.",
    "- Keep proper nouns (Kateri, Diné, Navajo, Lighthouse) in their original form.",
    "- Respond with ONLY a raw JSON object mapping each input key to its translation.",
    "  No markdown, no code fences, no prose.",
    "- You MUST produce a Diné bizaad translation for every string. DO NOT return",
    "  English as the translation. Even if you're uncertain about idiomatic phrasing,",
    "  produce your best word-by-word Diné translation — the site has a visible",
    "  'machine-translated, pending native-speaker review' disclosure, so rough is",
    "  acceptable, but English-in-English-out is NOT acceptable.",
    "- For long prose strings (policies, paragraphs), translate sentence by sentence.",
    "  Keep proper nouns and place names in their original form where Navajo has no",
    "  equivalent, but translate the surrounding grammar and verbs.",
    "- These are user-interface strings (buttons, labels, headings). Keep translations concise.",
  ].join('\n');

  const payload = Object.fromEntries(entries.map((e) => [e.path, e.value]));
  const userPrompt = `Translate these English UI strings into Diné bizaad. Return a JSON object with the same keys:\n\n${JSON.stringify(payload, null, 2)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.6,
      system: systemPrompt,
      messages: [
        { role: 'user', content: [{ type: 'text', text: userPrompt }] },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const textParts = (data.content || [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('');

  // Claude sometimes wraps JSON in fences despite instructions. Strip them.
  let cleaned = textParts.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline >= 0) cleaned = cleaned.slice(firstNewline + 1);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Failed to parse Claude response as JSON:');
    console.error(cleaned.slice(0, 800));
    throw err;
  }
}

async function main() {
  const [enRaw, nvRaw] = await Promise.all([
    fs.readFile(EN_PATH, 'utf8'),
    fs.readFile(NV_PATH, 'utf8').catch(() => '{}'),
  ]);

  const en = JSON.parse(enRaw);
  const nv = JSON.parse(nvRaw);
  const meta = (nv.__meta && typeof nv.__meta === 'object') ? nv.__meta : {};

  const leaves = collectLeaves(en);
  const needsTranslation = [];
  let passthroughCount = 0;
  let reusedCount = 0;

  for (const leaf of leaves) {
    if (isDenylisted(leaf.value)) {
      setLeaf(nv, leaf.path, leaf.value);
      meta[leaf.path] = { hash: sha1(leaf.value), model: 'denylist', mt: false };
      passthroughCount++;
      continue;
    }

    const hash = sha1(leaf.value);
    const existing = meta[leaf.path];
    if (existing && existing.hash === hash) {
      // Already translated from this exact English source. Skip.
      reusedCount++;
      continue;
    }

    needsTranslation.push(leaf);
  }

  console.log(`en.json leaves:      ${leaves.length}`);
  console.log(`  already translated: ${reusedCount}`);
  console.log(`  passthrough:        ${passthroughCount}`);
  console.log(`  to translate:       ${needsTranslation.length}`);

  if (needsTranslation.length === 0) {
    // Write meta even when nothing new, in case passthroughs changed
    nv.__meta = meta;
    await fs.writeFile(NV_PATH, JSON.stringify(nv, null, 2) + '\n', 'utf8');
    console.log('nv.json is up to date.');
    return;
  }

  for (let i = 0; i < needsTranslation.length; i += BATCH_SIZE) {
    const batch = needsTranslation.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsTranslation.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} strings)…`);

    const result = await translateBatch(batch);
    for (const leaf of batch) {
      const translated = result[leaf.path];
      if (typeof translated !== 'string' || !translated.trim()) {
        console.warn(`    [warn] missing translation for ${leaf.path}, falling back to English`);
        setLeaf(nv, leaf.path, leaf.value);
        meta[leaf.path] = { hash: sha1(leaf.value), model: 'fallback-en', mt: false };
        continue;
      }

      // Reject responses where Claude returned the English source unchanged
      // on anything longer than a proper noun. The denylist already handles
      // protected brand terms before we reach this path, so anything
      // identical here is a Claude cop-out we should flag loudly.
      const looksLikeFallback =
        translated.trim() === leaf.value.trim() && leaf.value.trim().split(/\s+/).length > 2;
      if (looksLikeFallback) {
        console.warn(`    [warn] ✗ Claude returned English verbatim for ${leaf.path}`);
        // Store English but do NOT write the hash to __meta — that way the
        // next script run will retry this key. Don't corrupt the visible
        // UI with [NV?] markers; keep English until a human edits it.
        setLeaf(nv, leaf.path, leaf.value);
        // Intentionally omit meta[leaf.path] so it re-attempts next run
      } else {
        setLeaf(nv, leaf.path, translated);
        meta[leaf.path] = { hash: sha1(leaf.value), model: MODEL, mt: true };
      }
    }
  }

  // Keep __meta at the top of the file for visibility
  const ordered = { __meta: meta, ...Object.fromEntries(Object.entries(nv).filter(([k]) => k !== '__meta')) };
  await fs.writeFile(NV_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
  console.log(`✓ Wrote ${NV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
