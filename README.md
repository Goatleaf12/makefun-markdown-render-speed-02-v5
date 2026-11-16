# markdown-render-speed-02 — v5

Fast, dependency-free Markdown renderer producing byte-exact
[marked](https://github.com/markedjs/marked) 18.1.3 output (GFM defaults).

## Usage

```js
import { parse } from './parse.js';

parse('# Hello\n\nSome **bold** text.');
// => '<h1>Hello</h1>\n<p>Some <strong>bold</strong> text.</p>\n'
```

`parse(markdown)` returns an HTML string, byte-identical to marked 18.1.3
with default (GFM) options.

## Design

- Cursor-based block lexer with sticky regexes (no remainder slicing).
- Direct HTML emission; link definitions collected in a first block pass
  because inline parsing is deferred until all definitions are known.
- Fast inline text token: native scans instead of the lookahead-heavy
  text regex; emphasis/delimiter lookahead shielded by regex masking.
- Zero dependencies. Runs on plain Node.js.

## Files

- `parse.js` — the renderer (`export function parse(markdown)`).
- `main.ts` — harness driver: reads `/input/cases.json`, writes
  `/output/html.json`.
- `LICENSE` — MIT.

## Performance

Measured locally on the kit's 720 practice cases (interleaved with the
marked baseline, median process CPU time):

- 720/720 byte-identical vs marked 18.1.3.
- ~0.96 s CPU for the full 720-case set — about 1.68x faster than marked.

## License

MIT — see `LICENSE`. SPDX-License-Identifier: MIT.
