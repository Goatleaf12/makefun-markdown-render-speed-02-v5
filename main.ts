// SPDX-License-Identifier: MIT
// Driver: reads every case from /input/cases.json, renders each one alone
// with parse() from parse.js, writes /output/html.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8'));
const html = [];
for (const c of cases) html.push(parse(c.markdown));
writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
