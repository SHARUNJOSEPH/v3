#!/usr/bin/env node
/**
 * Zero-dependency security lint for PixelMap entry JS.
 * Mirrors the high-signal eslint-plugin-security checks so Gate G4 can
 * run when `eslint` is not yet installed (e.g. registry egress blocked).
 *
 * Usage: node scripts/security-lint.js [files...]
 * Exit 0 = no errors (warnings allowed). Exit 1 = one or more errors.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILES = ['js/stage3d.js', 'js/aptabase.js', 'js/app.js'];

/** @typedef {{ id: string, severity: 'error'|'warn', re: RegExp, message: string, allow?: (line: string) => boolean }} Rule */

/** @type {Rule[]} */
const RULES = [
  {
    id: 'detect-eval-with-expression',
    severity: 'error',
    re: /\beval\s*\(|\bnew\s+Function\s*\(/,
    message: 'Avoid eval() / new Function() (CSP + XSS risk)',
    allow: (line) => /\/\/.*\beval\b|without relying on eval|no eval/i.test(line),
  },
  {
    id: 'detect-child-process',
    severity: 'error',
    re: /\b(?:child_process|execSync|spawnSync)\b|\brequire\s*\(\s*['"]child_process['"]\s*\)/,
    message: 'child_process usage is unexpected in browser SPA code',
  },
  {
    id: 'detect-non-literal-require',
    severity: 'warn',
    re: /\brequire\s*\(\s*[^'")\s][^)]*\)/,
    message: 'Non-literal require() (warn)',
    allow: (line) => /require\s*\(\s*['"`]/.test(line),
  },
  {
    id: 'detect-document-write',
    severity: 'error',
    re: /\bdocument\.write(?:ln)?\s*\(/,
    message: 'document.write is an XSS vector — avoid',
  },
  {
    id: 'detect-string-timer',
    severity: 'error',
    re: /\b(?:setTimeout|setInterval)\s*\(\s*(['"`])/,
    message: 'setTimeout/setInterval with string arg is eval-equivalent',
  },
  {
    id: 'detect-innerHTML-assignment',
    severity: 'warn',
    re: /\.innerHTML\s*=/,
    message: 'innerHTML assignment — ensure value is trusted / sanitized (warn baseline)',
    allow: (line) => {
      // Empty clear is safe: el.innerHTML = '' / ""
      if (/\.innerHTML\s*=\s*(['"`])\s*\1/.test(line)) return true;
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return true;
      return false;
    },
  },
  {
    id: 'detect-unsafe-html-concat',
    severity: 'warn',
    re: /\.innerHTML\s*\+=|\.outerHTML\s*=/,
    message: 'outerHTML / innerHTML+= — review for XSS (warn)',
  },
  {
    id: 'detect-pseudoRandomBytes',
    severity: 'error',
    re: /\.pseudoRandomBytes\s*\(/,
    message: 'crypto.pseudoRandomBytes is deprecated / weak — use randomBytes',
  },
  {
    id: 'detect-buffer-constructor',
    severity: 'error',
    re: /\bnew\s+Buffer\s*\(/,
    message: 'new Buffer() is deprecated / unsafe — use Buffer.from/alloc',
  },
  {
    id: 'detect-bidi-characters',
    severity: 'error',
    re: /[‪-‮⁦-⁩]/,
    message: 'Bidirectional / invisible unicode control characters detected',
  },
];

function stripCommentsAndStrings(line) {
  // Rough strip for allow checks already handle comments; keep simple for matching
  return line;
}

function lintFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    return [{ file: relPath, line: 0, severity: 'error', id: 'file-missing', message: `File not found: ${relPath}` }];
  }
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  /** @type {Array<{file:string,line:number,severity:'error'|'warn',id:string,message:string,snippet:string}>} */
  const findings = [];

  lines.forEach((raw, idx) => {
    const line = stripCommentsAndStrings(raw);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      if (rule.allow && rule.allow(line)) continue;
      findings.push({
        file: relPath,
        line: idx + 1,
        severity: rule.severity,
        id: rule.id,
        message: rule.message,
        snippet: trimmed.slice(0, 140),
      });
    }
  });

  return findings;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const files = args.length ? args : DEFAULT_FILES;

  let all = [];
  for (const f of files) {
    all = all.concat(lintFile(f.replace(/\\/g, '/')));
  }

  const errors = all.filter((x) => x.severity === 'error');
  const warns = all.filter((x) => x.severity === 'warn');

  const byFile = {};
  for (const f of files) byFile[f.replace(/\\/g, '/')] = { error: 0, warn: 0 };
  for (const hit of all) {
    if (!byFile[hit.file]) byFile[hit.file] = { error: 0, warn: 0 };
    byFile[hit.file][hit.severity] += 1;
  }

  for (const hit of all) {
    const tag = hit.severity === 'error' ? 'error' : 'warn ';
    console.log(`${hit.file}:${hit.line}  ${tag}  ${hit.id}  ${hit.message}`);
    console.log(`    ${hit.snippet}`);
  }

  console.log('');
  console.log('Summary (security-lint fallback — install eslint for full plugin):');
  for (const [file, c] of Object.entries(byFile)) {
    console.log(`  ${file}: ${c.error} error(s), ${c.warn} warning(s)`);
  }
  console.log(`  TOTAL: ${errors.length} error(s), ${warns.length} warning(s)`);

  if (errors.length) {
    process.exitCode = 1;
  } else {
    console.log('Lint OK (0 errors; warnings are Gate G4 baseline).');
  }
}

main();
