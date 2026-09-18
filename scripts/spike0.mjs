#!/usr/bin/env node
// Spike 0 helper for the Habit experiment in ducktective/AGENTS.md.
// Preserves any content outside the HABIT-EXPERIMENT markers byte-for-byte.
// Usage: node spike0.mjs add|remove|check

import { readFileSync, writeFileSync } from 'node:fs';

const [, , command, target] = process.argv;
const usage = 'Usage: node spike0.mjs add|remove|check [path-to-AGENTS.md]';
const path = target ?? 'AGENTS.md';

const START = '<!-- HABIT-EXPERIMENT:START';
const END = '<!-- HABIT-EXPERIMENT:END -->';

const doc = readFileSync(path, 'utf8');
const start = doc.indexOf(START);
const end = doc.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`No complete HABIT-EXPERIMENT block found in ${path}.`);
  process.exit(1);
}

const block = doc.slice(start, end + END.length);
const before = doc.slice(0, start);
const after = doc.slice(end + END.length);

if (command === 'check') {
  console.log(`HABIT-EXPERIMENT block present in ${path} (${block.split('\n').length} lines).`);
  console.log(`Content outside the markers: ${before.trimEnd().length + after.trimStart().length} chars.`);
} else if (command === 'remove') {
  const rest = (before.trimEnd() + '\n' + after.replace(/^\s*\n/, '')).replace(/\n{3,}/g, '\n\n');
  writeFileSync(path, rest);
  console.log(`Removed the experiment block from ${path}. Original preserved in git (commit 1d0223d).`);
} else if (command === 'add') {
  console.log('Block already present; nothing to do.');
} else {
  console.error(usage);
  process.exit(1);
}
