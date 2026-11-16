// SPDX-License-Identifier: MIT
// Fast renderer producing byte-exact marked 18.1.3 output (GFM defaults).
// Written from scratch against marked's published behavior; no dependency.
// Design: cursor-based scanning with sticky regexes (no remainder slicing),
// direct HTML emission, link definitions collected in a first block pass
// because inline parsing is deferred until all definitions are known.

const HAS_LOOKBEHIND = (() => { try { return !!new RegExp('(?<=1)(?<!1)'); } catch { return false; } })();

function R(a, e = '') {
  let t = typeof a === 'string' ? a : a.source;
  const n = {
    replace: (s, r) => {
      let o = typeof r === 'string' ? r : r.source;
      o = o.replace(T.caret, '$1');
      t = t.replace(s, o);
      return n;
    },
    getRegex: () => new RegExp(t, e),
  };
  return n;
}
const NO_MATCH = { exec: () => null };

const K = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

const T = {
  lheadingGate: /\n {0,3}(?:=+|-+)[ \t]*(?:\n|$)/,
  codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
  outputLinkReplace: /\\([\[\]])/g,
  indentCodeCompensation: /^(\s+)(?:```)/,
  beginningSpace: /^\s+/,
  endingHash: /#$/,
  startingSpaceChar: /^ /,
  endingSpaceChar: / $/,
  endingSpaceTabChar: /[ \t]$/,
  nonSpaceChar: /[^ ]/,
  newLineCharGlobal: /\n/g,
  tabCharGlobal: /\t/g,
  leadingSpaceTab: /^[ \t]+/,
  multipleSpaceGlobal: /\s+/g,
  blankLine: /^[ \t]*$/,
  doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
  blockquoteStart: /^ {0,3}>/,
  blockquoteSetextReplace: /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g,
  blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
  blockquoteMarkerWhitespace: /^( {0,3}>)([ \t]+)/gm,
  listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
  listIsTask: /^\[[ xX]\][ \t]+\S/,
  listReplaceTask: /^\[[ xX]\][ \t]+/,
  listTaskCheckbox: /\[[ xX]\]/,
  anyLine: /\n.*\n/,
  hrefBrackets: /^<(.*)>$/,
  tableDelimiter: /[:|]/,
  tableAlignChars: /^\||\| *$/g,
  tableRowBlankLine: /\n[ \t]*$/,
  tableAlignRight: /^ *-+: *$/,
  tableAlignCenter: /^ *:-+: *$/,
  tableAlignLeft: /^ *:-+ *$/,
  startATag: /^<a /i,
  endATag: /^<\/a>/i,
  startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
  endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
  startAngleBracket: /^</,
  endAngleBracket: />$/,
  pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
  unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
  numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,
  numericCharacterReferenceOrAmpersand: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  escapeTest: /[&<>"']/,
  escapeReplace: /[&<>"']/g,
  escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
  escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
  caret: /(^|[^\[])\^/g,
  percentDecode: /%25/g,
  findPipe: /\|/g,
  splitPipe: / \|/,
  slashPipe: /\\\|/g,
  carriageReturn: /\r\n|\r/g,
  spaceLine: /^ +$/gm,
  notSpaceStart: /^\S*/,
  endingNewline: /\n$/,
  listItemRegex: (a) => new RegExp(`( {0,3}${a})((?:[ \t][^\\n]*)?(?:\\n|$))`, 'y'),
  nextBulletRegex: D((a) => new RegExp(`^ {0,${a}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`)),
  hrRegex: D((a) => new RegExp(`^ {0,${a}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`)),
  fencesBeginRegex: D((a) => new RegExp(`^ {0,${a}}(?:\`\`\`|~~~)`)),
  headingBeginRegex: D((a) => new RegExp(`^ {0,${a}}#{1,6}(?:\\s|$)`)),
  pedanticHeadingBeginRegex: D((a) => new RegExp(`^ {0,${a}}#`)),
  htmlBeginRegex: D((a) => new RegExp(`^ {0,${a}}(?:</?(?:${K})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`, 'i')),
  blockquoteBeginRegex: D((a) => new RegExp(`^ {0,${a}}>`)),
};
function D(a) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1));
    let s = e[n];
    return s || (s = a(n), e[n] = s);
  };
}

// ---- block rules (GFM) ----
const BLOCK_NEWLINE = /^(?:[ \t]*(?:\n|$))+/;
const BLOCK_CODE = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
const BLOCK_FENCES = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}(?:(?=`)\1`*|(?=~)\1~*) *(?=\n|$)|$)/;
const BLOCK_HR = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
const BLOCK_HEADING = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
const BLOCK_BULLET = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
const BLOCK_LHEADING_SRC = /^((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+)[ \t]*(?:\n+|$)/;
const BLOCK_LHEADING = R(BLOCK_LHEADING_SRC)
  .replace(/bull/g, BLOCK_BULLET)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/\|table/g, '').getRegex();
const BLOCK_LHEADING_GFM = R(BLOCK_LHEADING_SRC)
  .replace(/bull/g, BLOCK_BULLET)
  .replace(/blockCode/g, /(?: {4}| {0,3}\t)/)
  .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/)
  .replace(/blockquote/g, / {0,3}>/)
  .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/)
  .replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/)
  .replace(/html/g, / {0,3}<[^\n>]+>\n/)
  .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
const BLOCK_PARA_SRC = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
const BLOCK_TEXT = /^[^\n]+/;
const LABEL_INNER = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\\n]|\n(?![ \t]*\n))+/;
const BLOCK_DEF = R(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/)
  .replace('label', LABEL_INNER)
  .replace('title', /(?:\"(?:\\[\s\S]|[^\"\\])*\"|'(?:\\[\s\S]|[^'\\\n]|\n(?!\n))*'|\((?:\\[\s\S]|[^()\\])*\))/).getRegex();
const BLOCK_LIST = R(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, BLOCK_BULLET).getRegex();
const COMMENT_SRC = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
const BLOCK_HTML = R(`^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?:[ \\t]+|\\n|/?>|$)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))`, 'i')
  .replace('comment', COMMENT_SRC)
  .replace('tag', K)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
function paraRegex(listRe) {
  return R(BLOCK_PARA_SRC)
    .replace('hr', BLOCK_HR)
    .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
    .replace('|lheading', '')
    .replace('|table', '')
    .replace('blockquote', ' {0,3}>')
    .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
    .replace('list', listRe)
    .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
    .replace('tag', K).getRegex();
}
const BLOCK_PARA = paraRegex(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/);
const BLOCK_PARA_LIST = paraRegex(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
const BLOCK_QUOTE = R(/^( {0,3}> ?(?:(?![ \t]*(?:\n|$))(paragraph)|[^\n]*)(?:\n|$))+/).replace('paragraph', BLOCK_PARA_LIST).getRegex();
const BLOCK_TABLE = R("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)")
  .replace('hr', BLOCK_HR)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('blockquote', ' {0,3}>')
  .replace('code', '(?: {4}| {0,3}\t)[^\\n]')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', K).getRegex();
const BLOCK_PARA_GFM = R(BLOCK_PARA_SRC)
  .replace('hr', BLOCK_HR)
  .replace('heading', ' {0,3}#{1,6}(?:\\s|$)')
  .replace('|lheading', '')
  .replace('table', BLOCK_TABLE)
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)')
  .replace('list', ' {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]')
  .replace('html', ' {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)')
  .replace('tag', K).getRegex();

// sticky variants (same pattern, y flag) for cursor-based exec.
// NOTE: a leading ^ must be stripped: in V8, ^ in a sticky regex only
// matches at position 0, not at lastIndex. The y flag itself anchors
// the match at lastIndex, so dropping ^ preserves the semantics.
// ^ must also be dropped when it opens an alternative (| or (), since
// those anchors would fail the same way; ^ inside [...] is kept.
function sty(re) {
  const src = re.source;
  let out = '';
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { out += c + (src[i + 1] ?? ''); i++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    if (c === '^' && !inClass && (i === 0 || src[i - 1] === '|' || src[i - 1] === '(')) continue;
    out += c;
  }
  return new RegExp(out, re.flags.replace('g', '').replace('y', '') + 'y');
}
const S_NEWLINE = sty(BLOCK_NEWLINE);
const S_CODE = sty(BLOCK_CODE);
const S_FENCES = sty(BLOCK_FENCES);
const S_HR = sty(BLOCK_HR);
const S_HEADING = sty(BLOCK_HEADING);
const S_LHEADING = sty(BLOCK_LHEADING_GFM);
const S_DEF = sty(BLOCK_DEF);
const S_LIST = sty(BLOCK_LIST);
const S_HTML = sty(BLOCK_HTML);
const S_PARA = sty(BLOCK_PARA_GFM);
const S_TEXT = sty(BLOCK_TEXT);
const S_TABLE = sty(BLOCK_TABLE);
const S_QUOTE = sty(BLOCK_QUOTE);
function ex(re, s, pos) { re.lastIndex = pos; return re.exec(s); }

// ---- inline rules (GFM) ----
const IN_ESCAPE = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
const IN_CODE = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
const IN_BR = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
const IN_TEXT_BASE = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
const PUNCT = /[\p{P}\p{S}]/u;
const PUNCT_SPACE = /[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE = /[^\s\p{P}\p{S}]/u;
const IN_PUNCT_TEST = R(/^((?![*_])punctSpace)/, 'u').replace(/punctSpace/g, PUNCT_SPACE).getRegex();
const OPEN_QUOTE = /[\p{Pi}\p{Ps}"']/u;
const PUNCT_NO_TILDE = /(?!~)[\p{P}\p{S}]/u;
const PUNCT_SPACE_NO_TILDE = /(?!~)[\s\p{P}\p{S}]/u;
const NOT_PUNCT_SPACE_TILDE = /(?:[^\s\p{P}\p{S}]|~)/u;
const IN_BLOCK_SKIP = R(/link|precode-code|html/, 'g')
  .replace('link', /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/)
  .replace('precode-', HAS_LOOKBEHIND ? '(?<!`)()' : '(^^|[^`])')
  .replace('code', /(?<b>`+)[^`]+\k<b>(?!`)/)
  .replace('html', /<(?! )[^<>]*?>/).getRegex();
const EM_STRONG_L_SRC = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
const IN_EM_LDELIM = R(EM_STRONG_L_SRC, 'u').replace(/punct/g, PUNCT_NO_TILDE).getRegex();
const RDELIM_AST_SRC = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
const IN_EM_RDELIM_AST = R(RDELIM_AST_SRC, 'gu').replace(/notPunctSpace/g, NOT_PUNCT_SPACE_TILDE).replace(/punctSpace/g, PUNCT_SPACE_NO_TILDE).replace(/punct/g, PUNCT_NO_TILDE).getRegex();
const RDELIM_UND_SRC = "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)";
const IN_EM_RDELIM_UND = R(RDELIM_UND_SRC, 'gu').replace(/notPunctSpace/g, NOT_PUNCT_SPACE).replace(/punctSpace/g, PUNCT_SPACE).replace(/punct/g, PUNCT).getRegex();
const IN_DEL_LDELIM = R(/^~~?(?:((?!~)punct)|[^\s~])/, 'u').replace(/punct/g, PUNCT).getRegex();
const DEL_RDELIM_SRC = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
const IN_DEL_RDELIM = R(DEL_RDELIM_SRC, 'gu').replace(/notPunctSpace/g, NOT_PUNCT_SPACE).replace(/punctSpace/g, PUNCT_SPACE).replace(/punct/g, PUNCT).getRegex();
const IN_ANY_PUNCT = R(/\\(punct)/, 'gu').replace(/punct/g, PUNCT).getRegex();
const IN_ANY_PUNCT_OUTSIDE_CODE = R(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/, 'gu').replace(/punct/g, PUNCT).getRegex();
const IN_AUTOLINK = R(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
  .replace('scheme', /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/)
  .replace('email', /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
const IN_COMMENT_TAG = R(COMMENT_SRC).replace('(?:-->|$)', '-->').getRegex();
const IN_TAG = R("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>")
  .replace('comment', IN_COMMENT_TAG)
  .replace('attribute', /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
const LABEL_BRACKETS = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
const LINK_LABEL = R(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace('brackets', LABEL_BRACKETS).getRegex();
const IN_LINK = R(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/)
  .replace('label', LINK_LABEL)
  .replace('href', /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/)
  .replace('title', /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\)/).getRegex();
const IN_REFLINK = R(/^!?\[(label)\]\[(ref)\]/).replace('label', LINK_LABEL).replace('ref', LABEL_INNER).getRegex();
const IN_NOLINK = R(/^!?\[(ref)\](?:\[\])?/).replace('ref', LABEL_INNER).getRegex();
const REFLINK_SEARCH_LABEL = /(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/;
const REFLINK_SEARCH_LABEL_R = R(REFLINK_SEARCH_LABEL).replace('brackets', LABEL_BRACKETS).getRegex();
const REFLINK_SEARCH_REF = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
const IN_REFLINK_SEARCH = R('reflink|nolink(?!\\()', 'g')
  .replace('reflink', R(/^!?\[(label)\]\[(ref)\]/).replace('label', REFLINK_SEARCH_LABEL_R).replace('ref', REFLINK_SEARCH_REF).getRegex())
  .replace('nolink', R(/^!?\[(ref)\](?:\[\])?/).replace('ref', REFLINK_SEARCH_REF).getRegex()).getRegex();
const URL_PROTOCOL = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
const URL_EMAIL = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
const URL_EMAIL_PROTO = R(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, URL_EMAIL).getRegex();
const IN_URL = R(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/)
  .replace('emailProtocol', URL_EMAIL_PROTO)
  .replace('protocol', URL_PROTOCOL)
  .replace('email', /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex();
const IN_BACKPEDAL = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
const IN_DEL = /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/;
const IN_TEXT = R(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|wwwStart|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/)
  .replace('protocol', URL_PROTOCOL)
  .replace(/emailProtocol/g, /(?:mailto|xmpp):/)
  .replace('wwwStart', HAS_LOOKBEHIND ? '(?<![^\\s*_~(])www\\.' : 'www\\.').getRegex();

const SI_ESCAPE = sty(IN_ESCAPE);
const SI_CODE = sty(IN_CODE);
const SI_BR = sty(IN_BR);
const SI_AUTOLINK = sty(IN_AUTOLINK);
const SI_TAG = sty(IN_TAG);
const SI_LINK = sty(IN_LINK);
const SI_REFLINK = sty(IN_REFLINK);
const SI_NOLINK = sty(IN_NOLINK);
const SI_EM_LDELIM = sty(IN_EM_LDELIM);
const SI_DEL_LDELIM = sty(IN_DEL_LDELIM);
const SI_DEL = sty(IN_DEL);
const SI_URL = sty(IN_URL);
const SI_TEXT = sty(IN_TEXT);

// ---- helpers (ported semantics from marked) ----
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function P(a, encode) {
  if (encode) {
    if (T.escapeTest.test(a)) return a.replace(T.escapeReplace, (m) => ESC_MAP[m]);
  } else if (T.escapeTestNoEncode.test(a)) {
    return a.replace(T.escapeReplaceNoEncode, (m) => ESC_MAP[m]);
  }
  return a;
}
function Ie(a) {
  return T.numericCharacterReference.test(a)
    ? a.replace(T.numericCharacterReferenceOrAmpersand, (e, t, n) => {
        if (t === undefined && n === undefined) return '&amp;';
        const s = t === undefined ? parseInt(n, 16) : parseInt(t, 10);
        return s === 0 || s > 1114111 || (s >= 55296 && s <= 57343)
          ? '\uFFFD'
          : s === 38 ? '&amp;' : String.fromCodePoint(s);
      })
    : a;
}
function he(a) {
  try { return encodeURI(a).replace(T.percentDecode, '%'); } catch { return null; }
}
function F(a) {
  return a.trim().replace(T.multipleSpaceGlobal, ' ').toLowerCase().toUpperCase().toLowerCase();
}
function ke(a, e) {
  if (a.indexOf(e[0]) === -1 && a.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < a.length; n++) {
    if (a[n] === '\\') n++;
    else if (a[n] === e[0]) t++;
    else if (a[n] === e[1] && (t--, t < 0)) return n;
  }
  return t > 0 ? -2 : -1;
}
function de(a, e) {
  const t = a.replace(T.findPipe, (r, o, i) => {
    let l = false, p = o;
    for (; --p >= 0 && i[p] === '\\';) l = !l;
    return l ? '|' : ' |';
  });
  const n = t.split(T.splitPipe);
  let s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) {
    if (n.length > e) n.splice(e);
    else for (; n.length < e;) n.push('');
  }
  for (; s < n.length; s++) n[s] = n[s].trim().replace(T.slashPipe, '|');
  return n;
}
function L(a, e, t) {
  const n = a.length;
  if (n === 0) return '';
  let s = 0;
  for (; s < n;) {
    const r = a.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return a.slice(0, n - s);
}
// Length of `a` after trimming trailing `e` chars (no slice allocation).
function Llen(a, e) {
  let n = a.length;
  while (n > 0 && a.charAt(n - 1) === e) n--;
  return n;
}
function ge(a) {
  const e = a.split('\n');
  let t = e.length - 1;
  for (; t >= 0 && T.blankLine.test(e[t]);) t--;
  return e.length - t <= 2 ? a : e.slice(0, t + 1).join('\n');
}
function J(a, e = 0) {
  let t = e, n = '';
  for (const s of a) {
    if (s === '\t') { const r = 4 - (t % 4); n += ' '.repeat(r); t += r; }
    else { n += s; t++; }
  }
  return n;
}

// ---- inline masking (emStrong/del lookahead shield) ----
function maskInfo(masked) {
  const e = { '*': -1, '_': -1 };
  let t = -1;
  const n = masked.length;
  for (let s = 0; s < n; s++) {
    const r = masked[s];
    if (r !== '*' && r !== '_' && r !== '~') continue;
    const o = s === 0 ? '\n' : masked[s - 1];
    let i = s + 1;
    for (; i < n && masked[i] === r;) i++;
    if (o !== ' ' && o !== '\t' && o !== '\n' && o !== '\r' && o !== '\f') {
      if (r === '~') t = s; else e[r] = s;
    }
    s = i - 1;
  }
  return { em: e, del: t };
}
function linkInText(e, links) {
  if (!e.includes('[')) return false;
  for (const n of e.matchAll(IN_BLOCK_SKIP)) {
    if (IN_LINK.test(n[0]) && e.charAt(n.index - 1) !== '!') return true;
  }
  for (const n of e.matchAll(IN_REFLINK_SEARCH)) {
    const s = n[0], r = s.lastIndexOf('[');
    if (!(s.charAt(0) === '!' || !links.has(F(s.slice(r + 1, -1)))) && !(r > 1 && linkInText(s.slice(1, r - 1), links))) return true;
  }
  return false;
}
function maskInline(src, links) {
  let t = src;
  const hasBackslash = src.includes('\\');
  const hasBacktick = src.includes('`');
  const hasBracket = src.includes('[');
  const hasLt = src.includes('<');
  // Gate: the mask only hides delimiters, so it is a no-op when every
  // delimiter sits before the first mask-start char ('[', '`', '<', '\\').
  const firstMask = Math.min(
    hasBracket ? src.indexOf('[') : Infinity,
    hasBacktick ? src.indexOf('`') : Infinity,
    hasLt ? src.indexOf('<') : Infinity,
    hasBackslash ? src.indexOf('\\') : Infinity);
  const lastDelim = Math.max(src.lastIndexOf('*'), src.lastIndexOf('_'), src.lastIndexOf('~'));
  if (lastDelim < firstMask) return t;
  if (links.size && src.includes('[')) {
    const n = IN_REFLINK_SEARCH;
    const s = (r) => {
      const o = r.lastIndexOf('[');
      if (!links.has(F(r.slice(o + 1, -1)))) return r;
      if (o > 1 && r.charAt(0) !== '!') {
        const i = r.slice(1, o - 1);
        if (linkInText(i, links)) return '[' + i.replace(n, s) + '][' + 'a'.repeat(r.length - o - 2) + ']';
      }
      return '[' + 'a'.repeat(r.length - 2) + ']';
    };
    t = t.replace(n, s);
  }
  if (hasBackslash || hasBacktick) {
    t = t.replace(IN_ANY_PUNCT_OUTSIDE_CODE, (n, s, r) =>
      r ? '+'.repeat(n.length) : s ? s + n.slice(s.length, -s.length).replace(/`/g, '+') + s : n);
  }
  if (hasBracket || hasBacktick || hasLt) {
    t = t.replace(IN_BLOCK_SKIP, (n, s, r) => {
    const o = r ? r.length : 0;
    return n.slice(0, o) + '[' + 'a'.repeat(n.length - o - 2) + ']';
    });
  }
  return t;
}
function hasTagInLabel(full, label, labelStart) {
  if (!label.includes('<')) return false;
  for (let s = 0; s < label.length; s++) {
    if (label[s] === '\\') { s++; continue; }
    if (label[s] === '`') {
      const i = ex(SI_CODE, label, s);
      if (i) { s += i[0].length - 1; continue; }
    }
    if (label[s] !== '<') continue;
    const r = full.slice(labelStart + s);
    const o = IN_TAG.exec(r) || IN_AUTOLINK.exec(r);
    if (o) {
      if (o[0].length > label.length - s) return true;
      s += o[0].length - 1;
    }
  }
  return false;
}

// Emphasis / strong: port of marked's emStrong, index-based.
// s = source, m = masked source, pos = cursor, prev = previous-char, mi = maskInfo.
// Returns {raw, text, strong} or null.
function emStrong(s, m, pos, prev, mi) {
  const mt = ex(SI_EM_LDELIM, s, pos);
  if (!mt || (!mt[1] && !mt[2] && !mt[3] && !mt[4])) return null;
  const r = s[pos];
  const o = prev === r;
  const i = pos;
  let l = i;
  for (; l > 0 && m[l - 1] === r;) l--;
  let p = '';
  if (l > 0) {
    const cc0 = m.charCodeAt(l - 1);
    p = (cc0 >= 0xDC00 && cc0 <= 0xDFFF && l >= 2 && m.charCodeAt(l - 2) >= 0xD800 && m.charCodeAt(l - 2) <= 0xDBFF) ? m.slice(l - 2, l) : m[l - 1];
  }
  const h = p === '*' || p === '_' || !!IN_PUNCT_TEST.exec(p);
  let n = prev;
  if (l < i) n = p;
  const u = l < i ? h : !!IN_PUNCT_TEST.exec(n);
  if (mt[4] && n.match(T.unicodeAlphaNumeric)) return null;
  const d = mt[1] || mt[3] || '';
  if (!d || !n || u) {
    const k = [...mt[0]].length - 1;
    let g, b;
    let mm = k, f = 0;
    const y = i - l + k;
    const Rr = !!p.trim() && (!!d || (r === '*' && !h));
    const A = r === '*' ? IN_EM_RDELIM_AST : IN_EM_RDELIM_UND;
    const v = mi.em[r];
    const Q = i + k;
    if (v < Q) return null;
    const ee = v - Q;
    const t = m.slice(i + k);
    for (A.lastIndex = 0; ;) {
      const sm = A.exec(t);
      if (sm === null || sm.index > ee) break;
      g = sm[1] || sm[2] || sm[3] || sm[4] || sm[5] || sm[6];
      if (!g) continue;
      b = [...g].length;
      if (sm[3] || sm[4]) { mm += b; continue; }
      else if (sm[5] || sm[6] || Rr) {
        if (o && (sm[5] || sm[6])) break;
        if (y % 3 && !((y + b) % 3)) { f += b; continue; }
      }
      mm -= b;
      if (mm > 0) continue;
      b = Math.min(b, b + mm + f);
      const te = [...sm[0]][0].length;
      const M = s.slice(pos, i + k + sm.index + te + b);
      if (Math.min(k, b) % 2) {
        return { raw: M, text: M.slice(1, -1), strong: false };
      }
      return { raw: M, text: M.slice(2, -2), strong: true };
    }
  }
  return null;
}
function delAt(s, m, pos, prev, mi) {
  const mt = ex(SI_DEL_LDELIM, s, pos);
  if (!mt) return null;
  if (!((mt[1] || '') || !prev || IN_PUNCT_TEST.exec(prev))) return null;
  const o = [...mt[0]].length - 1;
  let p = o;
  const h = IN_DEL_RDELIM;
  const u = mi.del;
  const d = pos + o;
  if (u < d) return null;
  const k = u - d;
  const t = m.slice(d);
  for (h.lastIndex = 0; ;) {
    const sm = h.exec(t);
    if (sm === null || sm.index > k) break;
    const i = sm[1] || sm[2] || sm[3] || sm[4] || sm[5] || sm[6];
    if (!i) continue;
    const l = [...i].length;
    if (l !== o) continue;
    if (sm[3] || sm[4]) { p += l; continue; }
    p -= l;
    if (p > 0) continue;
    const bb = Math.min(l, l + p);
    const g = [...sm[0]][0].length;
    const b = s.slice(pos, d + sm.index + g + bb);
    return { raw: b, text: b.slice(o, -o) };
  }
  return null;
}

// ---- fast text token (replaces the lookahead-heavy IN_TEXT regex) ----
// The GFM text token runs from pos until just before: a hard char (\ < ! [ ` * ~ _),
// 2+ spaces + newline, a protocol://, www., or an email start; a lone non-alnum
// char before mailto:/xmpp: is a 1-char token. All stops are found with native
// scans (indexOf / char-class regex) instead of a lazy lookahead soup.
// One scan for the next text-token stop candidate: a hard char, a hard break
// (2+ spaces + newline), '://', 'www.', or '@'. Candidates are validated
// (protocol name / www lookbehind / email local part) before stopping.
const NEXT_STOP = /[\\<!\[`*~_]| {2,}\n|:\/\/|www\.|@/g;
const EMAIL_PROTOCOL = /(?:mailto|xmpp):[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/y;
const EMAIL_CHAR = new Uint8Array(128);
for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.!#$%&'*+/=?^_`{|}~-") EMAIL_CHAR[ch.charCodeAt(0)] = 1;
function textToken(s, pos) {
  const n = s.length;
  const c0 = s.charCodeAt(pos);
  // 1-char token: non-alphanumeric char followed by a valid mailto:/xmpp: address
  if (c0 < 48 || (c0 > 57 && c0 < 65) || (c0 > 90 && c0 < 97) || c0 > 122) {
    if (s.charCodeAt(pos + 1) === 109 || s.charCodeAt(pos + 1) === 120) { // 'm' or 'x'
      EMAIL_PROTOCOL.lastIndex = pos + 1;
      if (EMAIL_PROTOCOL.exec(s)) return s.slice(pos, pos + 1);
    }
  }
  // first-char group: backtick/tilde run, or a single char
  let i = pos + 1;
  if (c0 === 96 || c0 === 126) {
    while (i < n && s.charCodeAt(i) === c0) i++;
    if (i < n && (s.charCodeAt(i) === 96 || s.charCodeAt(i) === 126)) return s.slice(pos, i);
  }
  let stop = n;
  NEXT_STOP.lastIndex = i;
  let cm;
  while ((cm = NEXT_STOP.exec(s)) !== null) {
    const ci = cm.index;
    const cc = cm[0].charCodeAt(0);
    if (cc === 58) { // '://' -> check the protocol name before it
      const j = ci;
      let ps = -1;
      if (j >= 5 && s.slice(j - 5, j).toLowerCase() === 'https') ps = j - 5;
      else if (j >= 4 && s.slice(j - 4, j).toLowerCase() === 'http') ps = j - 4;
      else if (j >= 3 && s.slice(j - 3, j).toLowerCase() === 'ftp') ps = j - 3;
      if (ps !== -1 && ps >= i) { stop = ps; break; }
      continue;
    }
    if (cc === 119) { // 'www.' -> the char before must be ws, '*', '_', '~', '('
      const pc = s.charCodeAt(ci - 1);
      if (pc === 32 || pc === 9 || pc === 10 || pc === 13 || pc === 11 || pc === 12 || pc === 42 || pc === 95 || pc === 126 || pc === 40) { stop = ci; break; }
      continue;
    }
    if (cc === 64) { // '@' -> scan back for the email local part
      let ls = ci;
      while (ls > 0 && EMAIL_CHAR[s.charCodeAt(ls - 1)] === 1) ls--;
      if (ls < ci) { stop = ls <= pos ? pos : ls; break; }
      continue;
    }
    // hard char or hard break -> stop here
    stop = ci;
    break;
  }
  if (stop <= pos) return s.slice(pos, pos + 1);
  return s.slice(pos, stop);
}

// Gate for S_HTML / S_DEF: the regexes are `^ {0,3}<` / `^ {0,3}\[`, so they
// can only match when a '<' / '[' follows at most 3 spaces.
function htmlGate(str, pos) {
  let j = pos, sp = 0;
  while (sp < 3 && str.charCodeAt(j) === 32) { j++; sp++; }
  return str.charCodeAt(j) === 60;
}
function defGate(str, pos) {
  let j = pos, sp = 0;
  while (sp < 3 && str.charCodeAt(j) === 32) { j++; sp++; }
  return str.charCodeAt(j) === 91;
}
// Manual equivalent of T.lheadingGate = /\n {0,3}(?:=+|-+)[ \t]*(?:\n|$)/
// tested on str.slice(pos, end): is there a setext underline line in [pos, end)?
function hasSetext(str, pos, end) {
  let i = pos;
  while (i < end) {
    const nl = str.indexOf('\n', i);
    if (nl === -1 || nl >= end) return false;
    let j = nl + 1, sp = 0;
    while (j < end && str.charCodeAt(j) === 32 && sp < 3) { j++; sp++; }
    const c = str.charCodeAt(j);
    if (c === 61 || c === 45) {
      let k = j;
      while (k < end && str.charCodeAt(k) === c) k++;
      while (k < end && (str.charCodeAt(k) === 32 || str.charCodeAt(k) === 9)) k++;
      if (k >= end || str.charCodeAt(k) === 10) return true;
    }
    i = nl + 1;
  }
  return false;
}

// Table gate: the delimiter row must start with ':' or '-' after spaces / '|'.
function isTableStart(str, pos) {
  const nl = str.indexOf('\n', pos);
  if (nl === -1) return false;
  let j = nl + 1;
  let sp = 0;
  while (str.charCodeAt(j) === 32 && sp < 3) { j++; sp++; }
  if (str.charCodeAt(j) === 124) {
    j++;
    while (str.charCodeAt(j) === 32) j++;
  }
  const c = str.charCodeAt(j);
  return c === 45 || c === 58;
}

// Inline parse -> HTML string. state = {inLink, inRawBlock, linkEmitted, hasParen}
// Chars that can start / stop an inline construct.
const PLAIN_TEXT_CHECK = /[\\<!\[`*~_]/;
const NEEDS_ESCAPE = /[&<>"']/;
const BR_TEST = / {2,}\n/;
function inlineHtml(s, links, textMode, state) {
  // Fast path: no inline construct anywhere -> the whole string is one text token.
  // IN_URL can only match when the string holds '://', 'www.' or '@' (protocol,
  // www. or an email); compute once and skip the bare-URL regex otherwise.
  const hasUrlTrigger = s.includes('://') || s.includes('www.') || s.includes('@');
  if (!PLAIN_TEXT_CHECK.test(s) && !hasUrlTrigger && !BR_TEST.test(s)) {
    return textMode ? (state.inRawBlock ? s : Ie(s)) : (state.inRawBlock ? P(s) : P(Ie(s)));
  }
  const hasDelim = s.includes('*') || s.includes('_') || s.includes('~');
  const masked = hasDelim ? maskInline(s, links) : s;
  const mi = (masked.includes('*') || masked.includes('_') || masked.includes('~')) ? maskInfo(masked) : { em: { '*': -1, '_': -1 }, del: -1 };
  let html = '';
  let pos = 0;
  const n = s.length;
  let r = '';
  let isText = false;
  const hasParen = s.includes(')');
  while (pos < n) {
    if (!isText) r = '';
    isText = false;
    let m;
    // Dispatch on first char: most positions can only be a text token.
    // special: can start escape/tag/link/em/codespan/br/del/autolink.
    // urlStart: can start a bare URL/email (letters, digits, '.', '+', '-').
    const cc = s.charCodeAt(pos);
    const isSpecial = cc === 92 || cc === 60 || cc === 91 || cc === 33 || cc === 42 || cc === 95 || cc === 96 || cc === 126 || cc === 32;
    const isUrlStart = !isSpecial && ((cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 46 || cc === 43 || cc === 45);
    // escape
    if (cc === 92 && (m = (SI_ESCAPE.lastIndex = pos, SI_ESCAPE.exec(s)))) {
      const ch = m[1];
      html += textMode ? ch : P(ch);
      pos += m[0].length;
      continue;
    }
    // tag
    if (cc === 60 && (m = (SI_TAG.lastIndex = pos, SI_TAG.exec(s)))) {
      const raw = m[0];
      if (!state.inLink && T.startATag.test(raw)) state.inLink = true;
      else if (state.inLink && T.endATag.test(raw)) state.inLink = false;
      if (!state.inRawBlock && T.startPreScriptTag.test(raw)) state.inRawBlock = true;
      else if (state.inRawBlock && T.endPreScriptTag.test(raw)) state.inRawBlock = false;
      html += textMode ? raw : raw;
      pos += raw.length;
      continue;
    }
    // link
    if ((cc === 91 || cc === 33) && hasParen && (m = (SI_LINK.lastIndex = pos, SI_LINK.exec(s)))) {
      const res = tryLink(s, m, pos, links, state, textMode);
      if (res !== null) {
        html += res.html;
        pos += res.rawLen;
        continue;
      }
    }
    // reflink / nolink
    if ((cc === 91 || cc === 33) && ((m = (SI_REFLINK.lastIndex = pos, SI_REFLINK.exec(s))) || (m = (SI_NOLINK.lastIndex = pos, SI_NOLINK.exec(s))))) {
      const isImage = m[0].charAt(0) === '!';
      const labelStart = isImage ? 2 : 1;
      if (hasTagInLabel(s.slice(pos), m[1], labelStart)) {
        // fall through to text handling below
      } else {
        const ref = links.get(F(m[2] || m[1]));
        if (!ref) {
          const ch = m[0].charAt(0);
          html += textMode ? ch : P(ch);
          pos += 1;
          continue;
        }
        const res = makeLink(m, ref, pos, links, state, textMode, s);
        if (res !== null) {
          html += res.html;
          pos += res.rawLen;
          continue;
        }
        // makeLink returned null (nested link in label): fall through
      }
    }
    // emStrong
    if (cc === 42 || cc === 95) {
      const em = emStrong(s, masked, pos, r, mi);
      if (em) {
        const inner = inlineHtml(em.text, links, textMode, state);
        html += textMode ? inner : (em.strong ? `<strong>${inner}</strong>` : `<em>${inner}</em>`);
        pos += em.raw.length;
        continue;
      }
    }
    // codespan
    if (cc === 96 && (m = (SI_CODE.lastIndex = pos, SI_CODE.exec(s)))) {
      let txt = m[2].replace(T.newLineCharGlobal, ' ');
      const hasNonSpace = T.nonSpaceChar.test(txt);
      const wrapped = T.startingSpaceChar.test(txt) && T.endingSpaceChar.test(txt);
      if (hasNonSpace && wrapped) txt = txt.substring(1, txt.length - 1);
      html += textMode ? txt : `<code>${P(txt, true)}</code>`;
      pos += m[0].length;
      continue;
    }
    // br
    if ((cc === 32 || cc === 92) && (m = (SI_BR.lastIndex = pos, SI_BR.exec(s)))) {
      if (!textMode) html += '<br>';
      pos += m[0].length;
      continue;
    }
    // del
    if (cc === 126) {
      const dl = delAt(s, masked, pos, r, mi);
      if (dl) {
        const inner = inlineHtml(dl.text, links, textMode, state);
        html += textMode ? inner : `<del>${inner}</del>`;
        pos += dl.raw.length;
        continue;
      }
    }
    // autolink
    if (cc === 60 && (m = (SI_AUTOLINK.lastIndex = pos, SI_AUTOLINK.exec(s)))) {
      let href, txt;
      if (m[2] === '@') { txt = m[1]; href = 'mailto:' + txt; }
      else { txt = m[1]; href = txt; }
      if (textMode) html += txt;
      else {
        const enc = he(href);
        if (enc === null) html += P(txt, true);
        else html += `<a href="${P(enc, true)}">${P(txt, true)}</a>`;
      }
      pos += m[0].length;
      continue;
    }
    // url (GFM extended autolink)
    if (hasUrlTrigger && (isSpecial || isUrlStart) && !state.inLink && (m = (SI_URL.lastIndex = pos, SI_URL.exec(s)))) {
      let t0 = m[0];
      let prevT;
      do {
        prevT = t0;
        IN_BACKPEDAL.lastIndex = 0;
        const bp = IN_BACKPEDAL.exec(t0);
        t0 = bp ? bp[0] : '';
      } while (prevT !== t0);
      const txt = t0;
      const href = m[2] === '@' ? 'mailto:' + t0 : (m[1] === 'www.' ? 'http://' + t0 : t0);
      if (textMode) html += txt;
      else {
        const enc = he(href);
        if (enc === null) html += P(txt, true);
        else html += `<a href="${P(enc, true)}">${P(txt, true)}</a>`;
      }
      pos += t0.length;
      continue;
    }
    // text (fast token: native scans instead of the lookahead-heavy regex)
    {
      const raw = textToken(s, pos);
      if (raw) {
        if (raw.charCodeAt(raw.length - 1) !== 95) r = s[pos + raw.length - 1];
        isText = true;
        if (textMode) html += state.inRawBlock ? raw : Ie(raw);
        else if (state.inRawBlock) html += NEEDS_ESCAPE.test(raw) ? P(raw) : raw;
        else html += NEEDS_ESCAPE.test(raw) ? P(Ie(raw)) : raw;
        pos += raw.length;
        continue;
      }
    }
    // should not happen; avoid infinite loop
    html += textMode ? s[pos] : P(s[pos]);
    pos += 1;
  }
  return html;
}

// Shared link/image construction (De in marked).
// m = link/reflink match, ref = {href, title}, full = remaining source for Be check.
// Returns {html, rawLen} or null when the construct must fall through.
function makeLink(m, ref, pos, links, state, textMode, fullSrc) {
  const isImage = m[0].charAt(0) === '!';
  const label = m[1].replace(T.outputLinkReplace, '$1');
  const savedInLink = state.inLink;
  const savedEmitted = state.linkEmitted;
  const savedRawBlock = state.inRawBlock;
  state.inLink = true;
  state.linkEmitted = false;
  const innerHtml = inlineHtml(label, links, textMode || isImage, state);
  const nestedLink = state.linkEmitted;
  state.linkEmitted = savedEmitted;
  state.inLink = savedInLink;
  if (!isImage) {
    if (nestedLink) {
      state.inRawBlock = savedRawBlock;
      return null;
    }
    state.linkEmitted = true;
  }
  if (textMode) return { html: innerHtml, rawLen: m[0].length };
  if (isImage) {
    const enc = he(ref.href);
    if (enc === null) return { html: P(innerHtml), rawLen: m[0].length };
    let o = `<img src="${P(enc)}" alt="${P(innerHtml)}"`;
    if (ref.title) o += ` title="${P(ref.title)}"`;
    return { html: o + '>', rawLen: m[0].length };
  }
  const enc = he(ref.href);
  if (enc === null) return { html: innerHtml, rawLen: m[0].length };
  let o = `<a href="${P(enc)}"`;
  if (ref.title) o += ` title="${P(ref.title)}"`;
  return { html: o + '>' + innerHtml + '</a>', rawLen: m[0].length };
}

// Inline link `[...](...)` tokenizer with all of marked's guards.
function tryLink(s, m, pos, links, state, textMode) {
  const isImage = m[0].charAt(0) === '!';
  const labelStart = isImage ? 2 : 1;
  if (hasTagInLabel(s.slice(pos), m[1], labelStart)) return null;
  let href = m[2].trim();
  if (T.startAngleBracket.test(href)) {
    if (!T.endAngleBracket.test(href)) return null;
    const l = L(href.slice(0, -1), '\\');
    if ((href.length - l.length) % 2 === 0) return null;
  } else {
    const l = ke(m[2], '()');
    if (l === -2) return null;
    if (l > -1) {
      const h = (m[0].indexOf('!') === 0 ? 5 : 4) + m[1].length + l;
      m = [m[0].substring(0, h).trim(), m[1], m[2].substring(0, l), ''];
      href = m[2];
    }
  }
  const rl = L(m[0].slice(0, -1), '\\');
  if ((m[0].length - rl.length) % 2 === 0) return null;
  let o = m[2];
  let title = m[3] ? m[3].slice(1, -1) : '';
  o = o.trim();
  if (T.startAngleBracket.test(o)) o = o.slice(1, -1);
  const ref = {
    href: o && o.replace(IN_ANY_PUNCT, '$1'),
    title: title && title.replace(IN_ANY_PUNCT, '$1'),
  };
  return makeLink(m, ref, pos, links, state, textMode, s);
}

// ---- block lexing ----
// Nodes: {t, txt, ...}. txt holds the node's text content as a string.
// link definitions are collected into `links` (Map, first wins) during lexing;
// inline parsing happens at render time, after all definitions are known.
function Dt(a, e) {
  const n = a.match(T.indentCodeCompensation);
  if (n === null) return e;
  const s = n[1];
  return e.split('\n').map((r) => {
    const o = r.match(T.beginningSpace);
    if (o === null) return r;
    const i = o[0];
    return r.slice(Math.min(i.length, s.length));
  }).join('\n');
}
function prevNode(out) { return out.length ? out[out.length - 1] : undefined; }

function lexBlocks(str, start, end, top, links, out, inBq) {
  let pos = start;
  let guard = Infinity;
  let bqMerge = inBq;
  while (pos < end) {
    const remain = end - pos;
    if (remain >= guard) break; // infinite-loop guard (mirrors marked)
    guard = remain;
    let m;
    const fc = str.charCodeAt(pos);
    // space
    if ((fc === 10 || fc === 32 || fc === 9) && (m = ex(S_NEWLINE, str, pos)) && m[0].length > 0) {
      if (m[0].length === 1 && out.length > 0) { pos += 1; continue; }
      out.push({ t: 'space', raw: m[0] });
      pos += m[0].length;
      continue;
    }
    // indented code
    if ((fc === 32 || fc === 9) && (m = ex(S_CODE, str, pos))) {
      const raw = ge(m[0]);
      const txt = raw.replace(T.codeRemoveIndent, '');
      const prev = prevNode(out);
      if (prev && (prev.t === 'para' || prev.t === 'text')) {
        prev.txt += '\n' + txt;
        pos += raw.length;
        continue;
      }
      out.push({ t: 'code', txt });
      pos += raw.length;
      continue;
    }
    // fences
    if ((fc === 96 || fc === 126 || fc === 32 || fc === 9) && (m = ex(S_FENCES, str, pos))) {
      const txt = Dt(m[0], m[3] || '');
      const lang = m[2] ? m[2].trim().replace(IN_ANY_PUNCT, '$1') : m[2];
      out.push({ t: 'code', txt, lang });
      pos += m[0].length;
      continue;
    }
    // heading
    if ((fc === 35 || fc === 32 || fc === 9) && (m = ex(S_HEADING, str, pos))) {
      let txt = m[2].trim();
      if (T.endingHash.test(txt)) {
        const s = L(txt, '#');
        if (!s || T.endingSpaceTabChar.test(s)) txt = s.trim();
      }
      out.push({ t: 'heading', depth: m[1].length, txt });
      pos += Llen(m[0], '\n');
      continue;
    }
    // hr
    if ((fc === 45 || fc === 95 || fc === 42 || fc === 32 || fc === 9) && (m = ex(S_HR, str, pos))) {
      out.push({ t: 'hr' });
      pos += Llen(m[0], '\n');
      continue;
    }
    // blockquote (only a '>' or leading space/tab can start one)
    if (fc === 62 || fc === 32 || fc === 9) {
      const bq = tryBlockquote(str, pos, end, links);
      if (bq) {
        out.push(bq.node);
        pos += bq.consumed;
        continue;
      }
    }
    // list (only a marker, digit, or leading space/tab can start one)
    if (fc === 45 || fc === 43 || fc === 42 || (fc >= 48 && fc <= 57) || fc === 32 || fc === 9) {
      const lst = tryList(str, pos, end, links);
      if (lst) {
        out.push(lst.node);
        pos += lst.consumed;
        continue;
      }
    }
    // html (gated: the regex needs '<' after at most 3 spaces)
    if (htmlGate(str, pos) && (m = ex(S_HTML, str, pos))) {
      const raw = ge(m[0]);
      out.push({ t: 'html', txt: raw, pre: m[1] === 'pre' || m[1] === 'script' || m[1] === 'style' });
      pos += raw.length;
      continue;
    }
    // def (gated: the regex needs '[' after at most 3 spaces)
    if (defGate(str, pos) && (m = ex(S_DEF, str, pos))) {
      if (!T.startAngleBracket.test(m[2]) && ke(m[2], '()') !== -1) {
        // not a definition; fall through to the next tokenizers
      } else {
        const raw = L(m[0], '\n');
        const tag = F(m[1]);
        const href = m[2] ? m[2].replace(T.hrefBrackets, '$1').replace(IN_ANY_PUNCT, '$1') : '';
        const title = m[3] ? m[3].substring(1, m[3].length - 1).replace(IN_ANY_PUNCT, '$1') : m[3];
        const prev = prevNode(out);
        if (prev && (prev.t === 'para' || prev.t === 'text')) {
          prev.txt += '\n' + raw;
          pos += raw.length;
          continue;
        }
        if (!links.has(tag)) links.set(tag, { href, title });
        out.push({ t: 'def' });
        pos += raw.length;
        continue;
      }
    }
    // table (gated on the delimiter row starting with ':' or '-')
    if (isTableStart(str, pos) && (m = ex(S_TABLE, str, pos)) && T.tableDelimiter.test(m[2])) {
      const node = tryTable(m);
      if (node) {
        out.push(node);
        pos += Llen(m[0], '\n');
        continue;
      }
    }
    // lheading (gated: manual scan for a setext underline line before the
    // next blank line; no slice allocation, exactly T.lheadingGate's test)
    {
      const blankAt = str.indexOf('\n\n', pos);
      const regionEnd = blankAt === -1 ? str.length : blankAt;
      if (hasSetext(str, pos, regionEnd) && (m = ex(S_LHEADING, str, pos))) {
      const txt = m[1].trim();
        out.push({ t: 'heading', depth: m[2].charAt(0) === '=' ? 1 : 2, txt });
        pos += Llen(m[0], '\n');
        continue;
      }
    }
    // paragraph
    if (top && (m = ex(S_PARA, str, pos))) {
      let txt = m[1].charAt(m[1].length - 1) === '\n' ? m[1].slice(0, -1) : m[1];
      const prev = prevNode(out);
      if (bqMerge && prev && prev.t === 'para') {
        prev.txt += '\n' + txt;
      } else {
        out.push({ t: 'para', txt });
      }
      bqMerge = false;
      pos += m[0].length;
      continue;
    }
    // text
    if ((m = ex(S_TEXT, str, pos))) {
      const prev = prevNode(out);
      if (prev && prev.t === 'text') {
        prev.txt += '\n' + m[0];
      } else {
        out.push({ t: 'text', txt: m[0] });
      }
      pos += m[0].length;
      continue;
    }
    break; // nothing matched; mirrors marked's infinite-loop error path
  }
  return out;
}
function tryTable(m) {
  const headerCells = de(m[1]);
  const aligns = m[2].replace(T.tableAlignChars, '').split('|');
  const rowLines = m[3] && m[3].trim() ? m[3].replace(T.tableRowBlankLine, '').split('\n') : [];
  if (headerCells.length !== aligns.length) return null;
  const align = [];
  for (const a of aligns) {
    if (T.tableAlignRight.test(a)) align.push('right');
    else if (T.tableAlignCenter.test(a)) align.push('center');
    else if (T.tableAlignLeft.test(a)) align.push('left');
    else align.push(null);
  }
  const header = headerCells.map((txt, i) => ({ txt, align: align[i] }));
  const rows = rowLines.map((line) => de(line, header.length).map((txt, p) => ({ txt, align: align[p] })));
  return { t: 'table', header, rows };
}
function tryBlockquote(str, pos, end, links) {
  const m = ex(S_QUOTE, str, pos);
  if (!m) return null;
  const lines = L(m[0], '\n').split('\n');
  let s = '';
  let r = '';
  const items = [];
  let n = lines;
  while (n.length > 0) {
    let hasMarker = false;
    const chunk = [];
    let p;
    for (p = 0; p < n.length; p++) {
      if (T.blockquoteStart.test(n[p])) { chunk.push(n[p]); hasMarker = true; }
      else if (!hasMarker) chunk.push(n[p]);
      else break;
    }
    n = n.slice(p);
    const h = chunk.join('\n');
    const u = h
      .replace(T.blockquoteMarkerWhitespace, (g, b, mm) => b + J(mm, b.length))
      .replace(T.blockquoteSetextReplace, '\n    $1')
      .replace(T.blockquoteSetextReplace2, '');
    s = s ? `${s}\n${h}` : h;
    r = r ? `${r}\n${u}` : u;
    lexBlocks(u, 0, u.length, true, links, items, true);
    if (n.length === 0) break;
    const k = items[items.length - 1];
    if (!k) break;
    if (k.t === 'code' || k.t === 'heading' || k.t === 'hr' || k.t === 'html' || k.t === 'table') break;
    if (k.t === 'bq') {
      const b = n.join('\n');
      const mm = k.raw + '\n' + b.replace(T.blockquoteSetextReplace2, '');
      const f = tryBlockquote(mm, 0, mm.length, links);
      if (!f) break;
      items[items.length - 1] = f.node;
      const y = mm.substring(f.consumed).replace(/^\n/, '');
      const R = y ? y.split('\n').length : 0;
      const A = R ? n.slice(0, -R) : n;
      if (A.length > 0) s = `${s}\n${A.join('\n')}`;
      r = r.substring(0, r.length - k.txt.length) + f.node.txt;
      n = n.slice(A.length);
      if (n.length > 0 && T.blockquoteStart.test(n[0])) continue;
      break;
    } else if (k.t === 'list') {
      const b = k.raw + '\n' + n.join('\n');
      const mm = tryList(b, 0, b.length, links);
      if (!mm) break;
      items[items.length - 1] = mm.node;
      const f = mm.consumed > k.raw.length ? b.slice(k.raw.length + 1, mm.consumed).split('\n').length : 0;
      if (f > 0) {
        const y = n.slice(0, f).join('\n');
        s = `${s}\n${y}`;
        r = `${r}\n${y}`;
      }
      n = n.slice(f);
      continue;
    }
    // any other last token: continue with the next chunk
  }
  return { node: { t: 'bq', items, raw: s, txt: r }, consumed: s.length };
}
function tryList(str, pos, end, links) {
  const first = ex(S_LIST, str, pos);
  if (!first) return null;
  const n = str.slice(pos, end);
  // Work on offsets into `n` (no per-line remainder slicing).
  let ePos = 0;
  const r0 = first[1].trim();
  const ordered = r0.length > 1;
  const list = {
    t: 'list', ordered, start: ordered ? +r0.slice(0, -1) : '', loose: false, items: [],
  };
  const bulletRe = ordered ? `\\d{1,9}\\${r0.slice(-1)}` : `\\${r0}`;
  const itemRe = T.listItemRegex(bulletRe);
  let p = false;
  let m;
  while (ePos < n.length) {
    let u = false;
    const dParts = [];
    const hc = n.charCodeAt(ePos);
    itemRe.lastIndex = ePos;
    if (!(m = itemRe.exec(n)) || ((hc === 32 || hc === 45 || hc === 95 || hc === 42) && ex(S_HR, n, ePos))) break;
    const k = ePos;
    ePos += m[0].length;
    const nlG = m[2].indexOf('\n');
    const g = nlG === -1 ? m[2] : m[2].slice(0, nlG);
    const b = m[1].length;
    let mm = g.includes('\t') ? g.replace(T.leadingSpaceTab, (v) => J(v, b)) : g;
    const nlF = n.indexOf('\n', ePos);
    const f0 = nlF === -1 ? n.slice(ePos) : n.slice(ePos, nlF);
    let y = !mm.trim();
    const y0 = y;
    let R = 0;
    if (y) R = b + 1;
    else {
      R = mm.search(T.nonSpaceChar);
      R = R > 4 ? 1 : R;
      dParts.push(mm.slice(R));
      R += b;
    }
    if (y && T.blankLine.test(f0)) {
      ePos = nlF === -1 ? n.length : nlF + 1;
      u = true;
    }
    if (!u) {
      const v = T.nextBulletRegex(R);
      const Q = T.hrRegex(R);
      const ee = T.fencesBeginRegex(R);
      const te = T.headingBeginRegex(R);
      const M = T.htmlBeginRegex(R);
      const ne = T.blockquoteBeginRegex(R);
      while (ePos < n.length) {
        const nlU = n.indexOf('\n', ePos);
        const U = nlU === -1 ? n.slice(ePos) : n.slice(ePos, nlU);
        const f = U;
        const fc = f.charCodeAt(0);
        // Pre-check: only lines starting with a block-construct char can end the item.
        if (fc === 32 || fc === 35 || fc === 62 || fc === 96 || fc === 126 || fc === 45 || fc === 43 || fc === 42 || fc === 95 || fc === 60 || (fc >= 48 && fc <= 57)) {
          if (ee.test(f) || te.test(f) || M.test(f) || ne.test(f) || v.test(f) || Q.test(f)) break;
        }
        const Z = (fc === 32 || fc === 9) ? (f.includes('\t') ? f.replace(T.leadingSpaceTab, (me) => J(me)) : f) : f;
        let zi = 0;
        while (zi < Z.length && Z.charCodeAt(zi) === 32) zi++;
        if (zi === Z.length) zi = -1;
        if (zi >= R || zi === -1) dParts.push(Z.slice(R));
        else {
          if (y || mm.replace(T.tabCharGlobal, '    ').search(T.nonSpaceChar) >= 4 || ee.test(mm) || te.test(mm) || M.test(mm) || Q.test(mm)) break;
          const qe = /^ {0,3}(?:=+|-+) *$/.test(f) && BLOCK_LHEADING_GFM.test(`${mm}\n${f}`)
            ? `    ${Z.replace(/^ {0,3}/, '')}` : f;
          dParts.push(qe);
        }
        y = zi === -1;
        ePos = nlU === -1 ? n.length : nlU + 1;
        mm = Z.slice(R);
      }
    }
    const d = (y0 && dParts.length > 0 ? '\n' : '') + dParts.join('\n');
    const A = n.slice(k, ePos);
    if (!list.loose) {
      if (p) list.loose = true;
      else if (T.doubleBlankLine.test(A)) p = true;
    }
    list.items.push({
      t: 'item', raw: A, task: T.listIsTask.test(d), loose: false, txt: d, blocks: [],
    });
  }
  const last = list.items[list.items.length - 1];
  if (!last) return null;
  last.raw = last.raw.trimEnd();
  last.txt = last.txt.trimEnd();
  list.raw = n.slice(0, ePos).trimEnd();
  const consumed = list.raw.length;
  for (const u of list.items) {
    lexBlocks(u.txt, 0, u.txt.length, false, links, u.blocks, false);
    if (!list.loose) {
      const spaces = u.blocks.filter((g) => g.t === 'space');
      if (spaces.length > 0 && spaces.some((g) => T.anyLine.test(g.raw))) list.loose = true;
    }
  }
  for (const u of list.items) {
    const d0 = u.blocks[0];
    if (u.task && (d0 && (d0.t === 'text' || d0.t === 'para'))) {
      const stripped = u.txt.replace(T.listReplaceTask, '');
      const stripLen = u.txt.length - stripped.length;
      u.txt = stripped;
      d0.txt = d0.txt.replace(T.listReplaceTask, '');
      const kk = T.listTaskCheckbox.exec(u.raw);
      if (kk) {
        const cb = { t: 'checkbox', raw: kk[0] + ' ', checked: kk[0] !== '[ ]' };
        u.checked = cb.checked;
        if (list.loose) {
          if (d0 && (d0.t === 'para' || d0.t === 'text')) {
            d0.cb = cb.checked;
          } else {
            u.blocks.unshift({ t: 'para', txt: '', cbOnly: cb.checked });
          }
        } else {
          u.blocks.unshift(cb);
        }
      }
    } else if (u.task) {
      u.task = false;
    }
  }
  if (list.loose) {
    for (const u of list.items) {
      u.loose = true;
      for (const d0 of u.blocks) if (d0.t === 'text') d0.t = 'para';
    }
  }
  return { node: list, consumed };
}

// ---- rendering ----
function freshState() {
  return { inLink: false, inRawBlock: false, linkEmitted: false };
}
function checkboxHtml(checked) {
  return '<input ' + (checked ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
}
function renderBlocks(nodes, links, out, state) {
  for (const nd of nodes) {
    switch (nd.t) {
      case 'space':
      case 'def':
        break;
      case 'hr':
        out.push('<hr>\n');
        break;
      case 'heading':
        state.inRawBlock = false;
        out.push(`<h${nd.depth}>${inlineHtml(nd.txt, links, false, state)}</h${nd.depth}>\n`);
        break;
      case 'code': {
        const lang = (nd.lang || '').match(T.notSpaceStart)?.[0];
        const r = nd.txt ? nd.txt.replace(T.endingNewline, '') + '\n' : '';
        if (lang) out.push('<pre><code class="language-' + P(lang) + '">' + P(r, true) + '</code></pre>\n');
        else out.push('<pre><code>' + P(r, true) + '</code></pre>\n');
        break;
      }
      case 'html':
        out.push(nd.txt);
        break;
      case 'table': {
        let h = '';
        for (const c of nd.header) {
          h += cellHtml(c, true, links, state);
        }
        let t = `<tr>\n${h}</tr>\n`;
        let body = '';
        for (const row of nd.rows) {
          let r = '';
          for (const c of row) r += cellHtml(c, false, links, state);
          body += `<tr>\n${r}</tr>\n`;
        }
        if (body) body = `<tbody>${body}</tbody>`;
        out.push(`<table>\n<thead>\n${t}</thead>\n${body}</table>\n`);
        break;
      }
      case 'bq':
        out.push('<blockquote>\n');
        renderBlocks(nd.items, links, out, state);
        out.push('</blockquote>\n');
        break;
      case 'list': {
        const tag = nd.ordered ? 'ol' : 'ul';
        const attr = nd.ordered && nd.start !== 1 ? ` start="${nd.start}"` : '';
        out.push(`<${tag}${attr}>\n`);
        for (const it of nd.items) {
          out.push('<li>');
          renderBlocks(it.blocks, links, out, state);
          out.push('</li>\n');
        }
        out.push(`</${tag}>\n`);
        break;
      }
      case 'checkbox':
        out.push(checkboxHtml(nd.checked));
        break;
      case 'para': {
        state.inRawBlock = false;
        const inner = inlineHtml(nd.txt, links, false, state);
        if (nd.cb !== undefined) out.push(`<p>${checkboxHtml(nd.cb)}${inner}</p>\n`);
        else if (nd.cbOnly !== undefined) out.push(`<p>${checkboxHtml(nd.cbOnly)}</p>\n`);
        else out.push(`<p>${inner}</p>\n`);
        break;
      }
      case 'text': {
        state.inRawBlock = false;
        const inner = inlineHtml(nd.txt, links, false, state);
        if (nd.cb !== undefined) out.push(`${checkboxHtml(nd.cb)}${inner}`);
        else out.push(inner);
        break;
      }
      default:
        throw new Error('unknown block type ' + nd.t);
    }
  }
}
function cellHtml(c, isHeader, links, state) {
  state.inRawBlock = false;
  const inner = inlineHtml(c.txt, links, false, state);
  const tag = isHeader ? 'th' : 'td';
  return (c.align ? `<${tag} align="${c.align}">` : `<${tag}>`) + inner + `</${tag}>\n`;
}

export function parse(markdown) {
  const src = markdown.includes('\r') ? markdown.replace(T.carriageReturn, '\n') : markdown;
  const links = new Map();
  const nodes = [];
  lexBlocks(src, 0, src.length, true, links, nodes, false);
  const out = [];
  // One shared inline state for the whole document (marked Lexer.state):
  // inLink persists across blocks; inRawBlock is reset per inline stream.
  renderBlocks(nodes, links, out, freshState());
  return out.join('');
}
