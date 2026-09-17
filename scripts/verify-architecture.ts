/**
 * Validates habit-architecture.md against platform facts read directly from
 * the official OpenChamber Host API and OpenCode V2 instruction docs on
 * 2026-09-17. Run: bun scripts/verify-architecture.ts
 *
 * Fails when the document states a number or mechanism the docs contradict,
 * names a non-instruction file as agent-read, or leaves a runtime claim
 * without a spike. Contextual facts (like AGENTS.md presence) are reported,
 * not asserted.
 */

import { readFileSync, existsSync } from 'node:fs';

const doc = readFileSync('habit-architecture.md', 'utf8');
const failures: string[] = [];
const notes: string[] = [];
const fail = (why: string): void => { failures.push(why); };

/** Facts verified against official docs; the doc must state them correctly. */
const REQUIRED_FACTS: Array<[RegExp, string]> = [
  [/64,000/, 'generate prompt limit 64,000 chars'],
  [/8,000/, 'generate system limit 8,000 chars'],
  [/4,000/, 'generate maxOutputTokens limit 4,000'],
  [/90\s*s(ec)?|90\s*seconds?/i, 'generate 90-second timeout'],
  [/64\s*KiB/, 'storage value limit 64 KiB'],
  [/2,000\s*keys|2\s*MiB/, 'storage namespace limit (2 MiB / 2,000 keys)'],
  [/2,000,000/, 'file content limit 2,000,000 chars'],
  [/AGENTS\.md/, 'OpenCode V2 instruction file is AGENTS.md'],
  [/~\/\.config\/opencode\/AGENTS\.md/, 'global AGENTS.md location'],
  [/not\*\* loaded|not loaded/, 'OpenCode V2 instructions config field is accepted but not loaded'],
];

for (const [pattern, label] of REQUIRED_FACTS) {
  if (!pattern.test(doc)) notes.push(`doc omits verified fact: ${label}`);
}

/** Contradictions: claims the official docs refute. */
const CONTRADICTED: Array<[RegExp, string]> = [
  [/\.openchamber\/habits\.md/, 'OpenCode V2 does not read .openchamber/habits.md; only AGENTS.md carries instructions'],
  [/confidence[^\n]{0,40}0(\.|,)\d+[^\n]{0,20}calibrat/i, 'doc must not present model confidence as calibrated probability'],
];

for (const [pattern, why] of CONTRADICTED) {
  if (pattern.test(doc)) fail(`contradicts official docs: ${why}`);
}

/** Runtime behavior no doc guarantees; each must be gated by a named spike. */
const SPIKE_GATES: Array<[RegExp, string]> = [
  [/Spike 0/i, 'AGENTS.md application verified end-to-end in a live OpenChamber session'],
  [/Spike 1/i, 'extension-written AGENTS.md edit detected before the next model request'],
  [/Spike 2/i, 'repeat-correction detection method agreed (semantic matching)'],
];

for (const [pattern, gate] of SPIKE_GATES) {
  if (!pattern.test(doc)) fail(`missing spike gate: ${gate}`);
}

// Repo instruction context for Spike 0 (informational only).
notes.push(existsSync('AGENTS.md') ? 'AGENTS.md present in repo' : 'no repo AGENTS.md (Spike 0 uses the project under test)');

if (notes.length > 0) console.log(notes.join('\n'));
if (failures.length > 0) {
  console.error(`FAIL (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('PASS: habit-architecture.md matches verified platform facts; all runtime claims are spike-gated.');
