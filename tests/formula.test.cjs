'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createTinyDom() {
  function makeNode(tag, ns = '') {
    const attrs = new Map();
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      localName: tag.toLowerCase(),
      namespaceURI: ns || 'http://www.w3.org/1999/xhtml',
      className: '',
      children: [],
      childNodes: [],
      parentElement: null,
      parentNode: null,
      style: {},
      _text: '',
      get firstChild() { return this.childNodes[0] || null; },
      get textContent() {
        if (this.childNodes.length === 0) return this._text;
        return this.childNodes.map(c => c.textContent ?? c.nodeValue ?? '').join('');
      },
      set textContent(val) {
        this.childNodes = [];
        this.children = [];
        this._text = val == null ? '' : String(val);
      },
      setAttribute(name, val) {
        attrs.set(String(name), String(val));
        if (name === 'class') this.className = String(val);
      },
      getAttribute(name) {
        if (name === 'class' && this.className) return this.className;
        return attrs.get(String(name)) ?? null;
      },
      hasAttribute(name) {
        if (name === 'class' && this.className) return true;
        return attrs.has(String(name));
      },
      appendChild(node) {
        if (!node) return node;
        if (node.tagName === 'FRAGMENT') {
          for (const child of [...node.childNodes]) this.appendChild(child);
          node.childNodes = [];
          node.children = [];
          return node;
        }
        node.parentNode = this;
        node.parentElement = this;
        this.childNodes.push(node);
        if (node.nodeType === 1) this.children.push(node);
        return node;
      },
      append(...nodes) {
        for (const n of nodes) {
          if (typeof n === 'string') this.appendChild(doc.createTextNode(n));
          else this.appendChild(n);
        }
      },
      replaceChildren(...nodes) {
        this.childNodes = [];
        this.children = [];
        this._text = '';
        this.append(...nodes);
      },
      querySelectorAll(selector) {
        const out = [];
        const walk = cur => {
          for (const child of cur.children || []) {
            if (matchesSimple(child, selector)) out.push(child);
            walk(child);
          }
        };
        walk(this);
        return out;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      matches(selector) {
        return matchesSimple(this, selector);
      },
      closest(selector) {
        for (let cur = this; cur; cur = cur.parentElement) {
          if (matchesSimple(cur, selector)) return cur;
        }
        return null;
      }
    };
    return el;
  }

  function matchesSimple(el, selector) {
    if (!el || el.nodeType !== 1) return false;
    return selector.split(',').map(s => s.trim()).some(part => {
      if (part.startsWith('.')) return String(el.className || '').split(/\s+/).includes(part.slice(1));
      if (part === '[data-op-owned]') return el.hasAttribute('data-op-owned');
      if (part === '[role="button"]') return el.getAttribute('role') === 'button';
      if (part.startsWith('[')) {
        const attr = part.slice(1, -1).split('=')[0];
        return el.hasAttribute(attr);
      }
      return el.localName === part.toLowerCase();
    });
  }

  const doc = {
    compatMode: 'CSS1Compat',
    createElement: tag => makeNode(tag),
    createElementNS: (ns, tag) => makeNode(tag, ns),
    createTextNode: text => ({ nodeType: 3, nodeValue: String(text), textContent: String(text), parentElement: null, parentNode: null }),
    createDocumentFragment: () => makeNode('fragment')
  };
  return { doc, makeNode };
}

function loadFormulaEnv() {
  const { doc, makeNode } = createTinyDom();
  const context = vm.createContext({
    console,
    document: doc
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor/temml/temml.js'), 'utf8'), context, { filename: 'vendor/temml/temml.js' });
  const formulaPath = path.join(ROOT, 'src/formula.js');
  if (fs.existsSync(formulaPath)) {
    vm.runInContext(fs.readFileSync(formulaPath, 'utf8'), context, { filename: 'src/formula.js' });
  }
  return { doc, makeNode, temml: context.temml, Formula: context.ObsidianPrismFormula };
}

test('extractLanguageHint reads language-* classes, data-language, and header labels excluding buttons', () => {
  const { makeNode, Formula } = loadFormulaEnv();
  assert.ok(Formula, 'ObsidianPrismFormula must be defined on globalThis');

  const surface1 = makeNode('div');
  const header1 = makeNode('div'); header1.className = 'code-block-decoration';
  const label1 = makeNode('span'); label1.textContent = 'Code snippet';
  const btn1 = makeNode('button'); btn1.textContent = 'Copy';
  header1.append(label1, btn1);
  const pre1 = makeNode('pre');
  const code1 = makeNode('code'); code1.className = 'hljs language-latex';
  pre1.append(code1);
  surface1.append(header1, pre1);
  assert.equal(Formula.extractLanguageHint(surface1, pre1, code1), 'latex');

  const surface2 = makeNode('div');
  const header2 = makeNode('div'); header2.className = 'code-shell-header';
  const label2 = makeNode('span'); label2.textContent = 'Python';
  const btn2 = makeNode('button');
  const btnSpan = makeNode('span'); btnSpan.textContent = 'Copy code';
  btn2.append(btnSpan);
  const ownedBtn = makeNode('button'); ownedBtn.setAttribute('data-op-owned', ''); ownedBtn.textContent = 'Formula';
  header2.append(label2, btn2, ownedBtn);
  const pre2 = makeNode('pre');
  const code2 = makeNode('code');
  pre2.append(code2);
  surface2.append(header2, pre2);
  assert.equal(Formula.extractLanguageHint(surface2, pre2, code2), 'python');

  const surface3 = makeNode('div');
  surface3.setAttribute('data-language', 'KaTeX');
  const pre3 = makeNode('pre');
  const code3 = makeNode('code');
  pre3.append(code3);
  surface3.append(pre3);
  assert.equal(Formula.extractLanguageHint(surface3, pre3, code3), 'katex');

  const surface4 = makeNode('div');
  const header4 = makeNode('div'); header4.className = 'code-block-decoration';
  const label4 = makeNode('span'); label4.textContent = 'Code snippet';
  header4.append(label4);
  const pre4 = makeNode('pre');
  const code4 = makeNode('code'); code4.className = 'code-container formatted';
  pre4.append(code4);
  surface4.append(header4, pre4);
  assert.equal(Formula.extractLanguageHint(surface4, pre4, code4), 'code snippet');

  // Explicit adapter-resolved header element or string takes precedence without host selectors
  const customWrap = makeNode('div');
  const customHeader = makeNode('div'); customHeader.className = 'custom-host-header';
  const customSpan = makeNode('span'); customSpan.textContent = '代码段';
  const customBtn = makeNode('button'); customBtn.textContent = '复制';
  customHeader.append(customSpan, customBtn);
  const customPre = makeNode('pre');
  const customCode = makeNode('code');
  customPre.append(customCode);
  customWrap.append(customHeader, customPre);
  assert.equal(Formula.extractLanguageHint(customWrap, customPre, customCode, customHeader), '代码段');
  assert.equal(Formula.extractLanguageHint(customWrap, customPre, customCode, 'LaTeX'), 'latex');

  // Bare <pre> (surface === pre) must not read sibling header labels from parent prose container
  const mdParent = makeNode('div'); mdParent.className = 'markdown';
  const siblingShell = makeNode('div');
  const siblingHdr = makeNode('div'); siblingHdr.className = 'code-shell-header';
  siblingHdr.textContent = 'Python';
  siblingShell.append(siblingHdr);
  const barePre = makeNode('pre');
  const bareCode = makeNode('code');
  barePre.append(bareCode);
  mdParent.append(siblingShell, barePre);
  assert.equal(Formula.extractLanguageHint(barePre, barePre, bareCode), '');
});

test('isLikelyLatex matches explicit math labels and conservative unlabeled LaTeX while rejecting non-math code', () => {
  const { Formula } = loadFormulaEnv();
  assert.ok(Formula, 'ObsidianPrismFormula must be defined on globalThis');

  for (const label of ['latex', 'tex', 'math', 'katex', 'latex-math', 'LaTeX']) {
    assert.equal(Formula.isLikelyLatex('E = mc^2', label), true, `explicit label ${label} should match`);
  }

  for (const label of ['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'sql', 'bash', 'sh', 'json', 'css', 'html']) {
    assert.equal(Formula.isLikelyLatex('\\frac{a}{b} = c', label), false, `non-math label ${label} must never match`);
  }

  // Generic / unlabeled LaTeX positives
  assert.equal(
    Formula.isLikelyLatex('% 目标函数\n\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^N (y_i - \\hat{y}_i)^2', 'code snippet'),
    true,
    'unlabeled Code snippet with % comment and TeX math macros should match'
  );
  assert.equal(
    Formula.isLikelyLatex('\\begin{aligned}\na &= b + c \\\\\nd &= \\sqrt{e}\n\\end{aligned}', ''),
    true,
    'unlabeled aligned environment should match'
  );
  assert.equal(Formula.isLikelyLatex('$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$', 'text'), true);
  assert.equal(Formula.isLikelyLatex('\\[\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}\\]', 'snippet'), true);
  assert.equal(Formula.isLikelyLatex('\\alpha + \\beta = \\gamma', ''), true);
  assert.equal(Formula.isLikelyLatex('% 目标函数\n\\frac{a}{b} = c', '代码段'), true);
  assert.equal(Formula.isLikelyLatex('\\begin{aligned}\na &= b\n\\end{aligned}', '代码片段'), true);
  assert.equal(Formula.isLikelyLatex('\\alpha + \\beta = \\gamma', '代码'), true);
  assert.equal(Formula.isLikelyLatex('const x = 1;\nconsole.log(x);', '代码段'), false);

  // Generic / unlabeled programming & preamble negatives
  const negatives = [
    ['js', 'const total = items.reduce((sum, x) => sum + x, 0);\nconsole.log(total);'],
    ['ts', 'export interface Box { width: number; }\nconst getArea = (b: Box): number => b.width * 2;'],
    ['python', 'import math\ndef norm(v):\n    print(math.sqrt(sum(x * x for x in v)))'],
    ['bash', '#!/usr/bin/env bash\nexport NODE_ENV=production\necho "done"'],
    ['sql', 'SELECT id, title FROM notes WHERE archived = 0 ORDER BY id DESC;'],
    ['json', '{"palette": "obsidian", "enabled": true, "tokens": [1, 2, 3]}'],
    ['css', '.op-formula-preview { display: flex; color: #e3e3e3; margin: 8px 0; }'],
    ['html', '<div class="card"><h2>Title</h2><p>Value</p></div>'],
    ['latex-preamble', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\frac{1}{2}\n\\end{document}'],
    ['plain-code', 'x = y + 1\nz = x * 2'],
    ['empty', '   \n  ']
  ];
  for (const [kind, sample] of negatives) {
    assert.equal(Formula.isLikelyLatex(sample, 'code snippet'), false, `unlabeled ${kind} must not match`);
    assert.equal(Formula.isLikelyLatex(sample, ''), false, `empty-label ${kind} must not match`);
  }
});

test('segmentLatex splits depth-0 blank lines, preserves multi-line environments, and extracts % captions', () => {
  const { Formula } = loadFormulaEnv();
  assert.ok(Formula, 'ObsidianPrismFormula must be defined on globalThis');

  const input = [
    '% 1. 损失函数',
    '',
    '$$\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^N \\ell_i$$',
    '',
    '% 2. 梯度更新',
    '% 包含跨行空行',
    '\\begin{aligned}',
    'g_t &= \\nabla_\\theta \\mathcal{L}(\\theta_t) \\\\',
    '',
    '\\theta_{t+1} &= \\theta_t - \\eta g_t',
    '\\end{aligned}',
    '% 3. 紧邻注释开启新段',
    '\\[E = mc^2\\]'
  ].join('\r\n');

  const segments = JSON.parse(JSON.stringify(Formula.segmentLatex(input)));
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0].comments, ['1. 损失函数']);
  assert.equal(segments[0].math, '\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^N \\ell_i');
  assert.equal(segments[0].raw, '$$\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^N \\ell_i$$');

  assert.deepEqual(segments[1].comments, ['2. 梯度更新', '包含跨行空行']);
  assert.match(segments[1].math, /^\\begin\{aligned\}[\s\S]*\n\n[\s\S]*\\end\{aligned\}$/);

  assert.deepEqual(segments[2].comments, ['3. 紧邻注释开启新段']);
  assert.equal(segments[2].math, 'E = mc^2');
  assert.equal(segments[2].raw, '\\[E = mc^2\\]');

  const adjacentSingle = JSON.parse(JSON.stringify(Formula.segmentLatex('$$a = 1$$\n$$b = 2$$\n\\[c = 3\\]\n\\[d = 4\\]')));
  assert.deepEqual(adjacentSingle.map(s => s.math), ['a = 1', 'b = 2', 'c = 3', 'd = 4']);

  const adjacentMulti = JSON.parse(JSON.stringify(Formula.segmentLatex('$$\na = 1\n$$\n$$\nb = 2\n$$\n\\[\nc = 3\n\\]\n\\[\nd = 4\n\\]')));
  assert.deepEqual(adjacentMulti.map(s => s.math), ['a = 1', 'b = 2', 'c = 3', 'd = 4']);

  const bareThenDelimited = JSON.parse(JSON.stringify(Formula.segmentLatex('a = 1\n$$b = 2$$')));
  assert.deepEqual(bareThenDelimited.map(s => s.math), ['a = 1', 'b = 2']);
});

test('renderFormulaPreview renders MathML via Temml, degrades single failing segments, and rejects all-invalid blocks', () => {
  const { doc, temml, Formula } = loadFormulaEnv();
  assert.ok(Formula, 'ObsidianPrismFormula must be defined on globalThis');

  const okAndBad = [
    '% 正确公式 <img src=x onerror=alert(1)>',
    '\\frac{1}{2} + \\sqrt{x}',
    '',
    '% 坏掉的一段',
    '\\frac{1}{'
  ].join('\n');

  const partial = Formula.renderFormulaPreview(doc, temml, okAndBad);
  assert.equal(partial.ok, true);
  assert.equal(partial.renderedCount, 1);
  assert.equal(partial.fallbackCount, 1);
  assert.equal(partial.totalCount, 2);

  const wrapper = doc.createElement('div');
  wrapper.appendChild(partial.fragment);
  const segs = wrapper.querySelectorAll('.op-formula-segment');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].querySelector('.op-formula-caption').textContent, '正确公式 <img src=x onerror=alert(1)>');
  assert.equal(segs[0].querySelectorAll('img').length, 0, 'caption must never parse HTML');
  assert.ok(segs[0].querySelector('math'), 'valid segment renders native <math>');
  assert.equal(segs[0].querySelector('.op-formula-fallback'), null);

  assert.equal(segs[1].querySelector('math'), null);
  assert.equal(segs[1].querySelector('.op-formula-fallback').textContent, '\\frac{1}{');

  const allBad = Formula.renderFormulaPreview(doc, temml, '\\frac{1}{\n\n\\unknowncommand{x}');
  assert.equal(allBad.ok, false);
  assert.equal(allBad.fragment, null);
  assert.equal(allBad.renderedCount, 0);
});
