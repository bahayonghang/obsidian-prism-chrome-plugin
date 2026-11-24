/* Obsidian Prism Web — LaTeX detection, segmentation, and MathML Core preview builder.
 * Community port of RMvdesi/obsidian-prism. Modified 2026-11-23.
 * SPDX-License-Identifier: GPL-3.0-only. See NOTICE / MODIFICATIONS.md. */
(function (global) {
  'use strict';

  const EXPLICIT_MATH_HINTS = new Set(['latex', 'tex', 'math', 'katex', 'latex-math', 'mathjax']);
  const GENERIC_HINTS = new Set(['', 'code snippet', 'snippet', 'text', 'plain text', 'plaintext', 'txt', 'code', '代码段', '代码片段', '代码', '纯文本', '文本']);
  const LANG_CLASS_RE = /\b(?:language|lang)-([a-z0-9_+-]+)\b/i;
  const PREAMBLE_RE = /(?:^|\n)\s*\\(?:documentclass|usepackage)\b|\\begin\{document\}/;
  const MATH_ENV_RE = /\\begin\{(?:aligned|align\*?|equation\*?|gather\*?|multline\*?|cases|dcases|rcases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|split|array|subequations)\}/;
  const STRONG_MATH_CMD_RE = /\\(?:frac|dfrac|tfrac|cfrac|sum|prod|int|iint|iiint|oint|sqrt|partial|nabla|mathcal|mathbb|mathrm|mathbf|lim|sup|inf|argmax|argmin|binom)\b/;
  const MATH_OP_RE = /[=<>^_+\-*/{}]|\\(?:cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|propto|in|notin|subset|subseteq|cup|cap|to|mapsto|rightarrow|leftarrow|Rightarrow|Leftrightarrow|forall|exists|infty)\b/;
  const TEX_MATH_MACRO_RE = /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|frac|dfrac|tfrac|cfrac|sum|prod|int|iint|iiint|oint|sqrt|partial|nabla|infty|cdot|cdots|ldots|vdots|ddots|times|div|pm|mp|leq|le|geq|ge|neq|ne|approx|equiv|sim|simeq|cong|propto|in|notin|ni|subset|subseteq|supset|supseteq|cup|cap|setminus|emptyset|varnothing|forall|exists|nexists|neg|land|lor|implies|iff|to|gets|mapsto|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|langle|rangle|lfloor|rfloor|lceil|rceil|lvert|rvert|lVert|rVert|quad|qquad|mathcal|mathbb|mathrm|mathbf|mathit|boldsymbol|operatorname|text|lim|sup|inf|max|min|argmax|argmin|det|tr|dim|ker|sin|cos|tan|log|ln|exp|binom|dbinom|tbinom|hat|bar|tilde|vec|dot|ddot|overline|underline|left|right)\b/g;

  const PROGRAMMING_RE = [
    /^#!/m,
    /(?:^|\n)\s*\/\//,
    /(?:^|\n)\s*(?:const|let|var|function|async\s+function|class|interface|type|enum|export|import)\b/,
    /\b(?:console\.log|module\.exports|require\s*\(|document\.|window\.|addEventListener\s*\(|querySelector(?:All)?\s*\()\b/,
    /=>/,
    /(?:^|\n)\s*(?:def|async\s+def|elif|except|with\s+.+\s+as)\b/,
    /(?:^|\n)\s*from\s+[A-Za-z_][\w.]*\s+import\b/,
    /(?:^|\n)\s*import\s+[A-Za-z_]/,
    /\bprint\s*\(/,
    /(?:^|\n)\s*(?:echo\s+|export\s+[A-Za-z_]|source\s+|alias\s+|npm\s+|pnpm\s+|yarn\s+|git\s+|python3?\s+|node\s+|curl\s+|chmod\s+|mkdir\s+)/,
    /\bSELECT\b[\s\S]+\bFROM\b/i,
    /(?:^|\n)\s*(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i,
    /\b(?:display|position|background(?:-color)?|font-size|font-family|margin(?:-\w+)?|padding(?:-\w+)?|border(?:-\w+)?|flex|grid-template|color)\s*:\s*[^;\n]+;/i,
    /(?:^|\n)\s*(?:@media|@keyframes|@import|@font-face|:root)\b/,
    /<!doctype\s+html/i,
    /<(?:div|span|p|a|ul|ol|li|table|thead|tbody|tr|td|th|section|article|header|footer|main|nav|script|style|head|body|html|form|input|button|label|img|svg|path|h[1-6]|pre|code|br|hr)\b[^>]*>/i
  ];

  function headerLabelText(header) {
    if (!header) return '';
    const walk = node => {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue ?? node.textContent ?? '';
      if (node.nodeType !== 1) return '';
      const tag = (node.localName || node.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'svg' || tag === 'mat-icon') return '';
      if (node.getAttribute?.('role') === 'button' || node.hasAttribute?.('data-op-owned')) return '';
      const cls = ` ${node.getAttribute?.('class') || node.className || ''} `;
      if (/\s(?:mat-icon|google-symbols|material-icons|material-symbols-\w+)\s/.test(cls)) return '';
      if (node.childNodes?.length) return [...node.childNodes].map(walk).filter(Boolean).join(' ');
      if (node.children?.length) return [...node.children].map(walk).filter(Boolean).join(' ');
      return node.textContent || '';
    };
    return walk(header).replace(/\s+/g, ' ').trim();
  }

  function containsNode(root, target) {
    for (let cur = target; cur; cur = cur.parentElement) {
      if (cur === root) return true;
    }
    return false;
  }

  function findGenericHeader(surface, pre) {
    if (!surface || surface === pre) return null;
    for (const child of surface.children || []) {
      if (child === pre || containsNode(child, pre) || child.hasAttribute?.('data-op-owned')) continue;
      if (child.getAttribute?.('data-op-code-header') === 'true') return child;
    }
    for (const child of surface.children || []) {
      if (child === pre || containsNode(child, pre)) break;
      if (child.hasAttribute?.('data-op-owned')) continue;
      const tag = (child.localName || child.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'svg' || child.getAttribute?.('role') === 'button') continue;
      if (headerLabelText(child)) return child;
    }
    return null;
  }

  function extractLanguageHint(surface, pre, code, header = null) {
    const nodes = [code, pre, surface].filter(Boolean);
    for (const node of nodes) {
      const cls = node.getAttribute?.('class') || node.className || '';
      const match = String(cls).match(LANG_CLASS_RE);
      if (match) return match[1].toLowerCase();
    }
    for (const node of nodes) {
      const attr = node.getAttribute?.('data-language') || node.getAttribute?.('data-lang');
      if (attr && String(attr).trim()) return String(attr).trim().toLowerCase();
    }
    if (typeof header === 'string') return header.trim().toLowerCase();
    const resolvedHeader = header || findGenericHeader(surface, pre);
    return headerLabelText(resolvedHeader).toLowerCase();
  }

  function isLikelyLatex(source, languageHint = '') {
    const raw = String(source || '');
    if (!raw.trim() || PREAMBLE_RE.test(raw)) return false;

    const hint = String(languageHint || '').trim().toLowerCase();
    if (EXPLICIT_MATH_HINTS.has(hint)) return true;
    if (!GENERIC_HINTS.has(hint)) return false;

    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return false;
      } catch (_) {}
    }

    const codeBody = raw.replace(/\r\n?/g, '\n').split('\n').filter(line => !/^\s*%/.test(line)).join('\n');
    if (!codeBody.trim()) return false;
    if (PROGRAMMING_RE.some(re => re.test(codeBody))) return false;

    if (MATH_ENV_RE.test(codeBody)) return true;
    if (/\$\$[\s\S]+?\$\$/.test(codeBody) || /\\\[[\s\S]+?\\\]/.test(codeBody)) return true;
    if (STRONG_MATH_CMD_RE.test(codeBody) && MATH_OP_RE.test(codeBody)) return true;
    const macroMatches = codeBody.match(TEX_MATH_MACRO_RE);
    return Boolean(macroMatches && macroMatches.length >= 2);
  }

  function updateDelimiters(line, state) {
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '\\') {
        const next = line[i + 1];
        if (next === '[') { state.bracketDepth++; i += 2; continue; }
        if (next === ']') { state.bracketDepth = Math.max(0, state.bracketDepth - 1); i += 2; continue; }
        const beginMatch = line.slice(i).match(/^\\begin\s*\{([^}]+)\}/);
        if (beginMatch) { state.envDepth++; i += beginMatch[0].length; continue; }
        const endMatch = line.slice(i).match(/^\\end\s*\{([^}]+)\}/);
        if (endMatch) { state.envDepth = Math.max(0, state.envDepth - 1); i += endMatch[0].length; continue; }
        i += 2;
        continue;
      }
      if (ch === '%') break;
      if (ch === '$' && line[i + 1] === '$') {
        state.inDollarDisplay = !state.inDollarDisplay;
        i += 2;
        continue;
      }
      if (ch === '{') state.braceDepth++;
      else if (ch === '}') state.braceDepth = Math.max(0, state.braceDepth - 1);
      i++;
    }
  }

  function hasUnescapedToken(text, token) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text.startsWith(token, i)) return true;
    }
    return false;
  }

  function stripOuterDelimiters(raw) {
    if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length >= 4) {
      const inner = raw.slice(2, -2);
      if (!hasUnescapedToken(inner, '$$')) return inner.trim();
    }
    if (raw.startsWith('\\[') && raw.endsWith('\\]') && raw.length >= 4) {
      const inner = raw.slice(2, -2);
      let depth = 1;
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '\\') {
          if (inner[i + 1] === '[') depth++;
          else if (inner[i + 1] === ']') { depth--; if (depth === 0) break; }
          i++;
        }
      }
      if (depth === 1) return inner.trim();
    }
    return raw;
  }

  function segmentLatex(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const segments = [];
    let pendingComments = [];
    let mathLines = [];
    let activeDisplayDelimiter = null;
    const state = { braceDepth: 0, envDepth: 0, inDollarDisplay: false, bracketDepth: 0 };
    const atDepthZero = () => state.braceDepth === 0 && state.envDepth === 0 && !state.inDollarDisplay && state.bracketDepth === 0;

    const flush = () => {
      activeDisplayDelimiter = null;
      if (!mathLines.length) return;
      const raw = mathLines.join('\n').trim();
      mathLines = [];
      if (!raw) { pendingComments = []; return; }
      const math = stripOuterDelimiters(raw);
      if (!math) { pendingComments = []; return; }
      segments.push({ comments: pendingComments, math, raw });
      pendingComments = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const blank = !trimmed;
      if (atDepthZero()) {
        if (blank) {
          flush();
          continue;
        }
        if (/^\s*%/.test(line)) {
          flush();
          const caption = line.replace(/^\s*%+\s?/, '').trim();
          if (caption) pendingComments.push(caption);
          continue;
        }
        if (mathLines.length > 0 && (trimmed.startsWith('$$') || trimmed.startsWith('\\['))) {
          flush();
        }
      }
      if (mathLines.length === 0 && atDepthZero()) {
        if (trimmed.startsWith('$$')) activeDisplayDelimiter = '$$';
        else if (trimmed.startsWith('\\[')) activeDisplayDelimiter = '\\[';
      }
      mathLines.push(line);
      updateDelimiters(line, state);
      if (activeDisplayDelimiter && atDepthZero()) {
        flush();
      }
    }
    flush();
    return segments;
  }

  function containsMathNode(node) {
    if (!node) return false;
    if ((node.localName || node.tagName || '').toLowerCase() === 'math') return true;
    for (const child of node.children || []) {
      if (containsMathNode(child)) return true;
    }
    return false;
  }

  function clearElement(node) {
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
    else node.textContent = '';
  }

  function renderFormulaPreview(doc, temmlEngine, source) {
    if (!doc || !temmlEngine || typeof temmlEngine.render !== 'function') {
      return { ok: false, fragment: null, renderedCount: 0, fallbackCount: 0, totalCount: 0 };
    }
    const segments = segmentLatex(source);
    if (!segments.length) {
      return { ok: false, fragment: null, renderedCount: 0, fallbackCount: 0, totalCount: 0 };
    }
    const fragment = doc.createDocumentFragment();
    let renderedCount = 0;
    let fallbackCount = 0;

    for (const segment of segments) {
      const segEl = doc.createElement('div');
      segEl.className = 'op-formula-segment';
      for (const caption of segment.comments) {
        const p = doc.createElement('p');
        p.className = 'op-formula-caption';
        p.textContent = caption;
        segEl.append(p);
      }
      const mathBox = doc.createElement('div');
      mathBox.className = 'op-formula-math';
      try {
        temmlEngine.render(segment.math, mathBox, {
          displayMode: true,
          throwOnError: true,
          trust: false,
          strict: false,
          xml: false
        });
        const hasMath = Boolean(mathBox.querySelector?.('math') || containsMathNode(mathBox));
        if (!hasMath) throw new Error('NO_MATHML_OUTPUT');
        renderedCount++;
      } catch (_) {
        clearElement(mathBox);
        const fallback = doc.createElement('pre');
        fallback.className = 'op-formula-fallback';
        fallback.textContent = segment.raw || segment.math;
        mathBox.append(fallback);
        fallbackCount++;
      }
      segEl.append(mathBox);
      fragment.append(segEl);
    }

    if (renderedCount === 0) {
      return { ok: false, fragment: null, renderedCount: 0, fallbackCount, totalCount: segments.length };
    }
    return { ok: true, fragment, renderedCount, fallbackCount, totalCount: segments.length };
  }

  global.ObsidianPrismFormula = Object.freeze({
    extractLanguageHint,
    isLikelyLatex,
    segmentLatex,
    renderFormulaPreview
  });
})(globalThis);
