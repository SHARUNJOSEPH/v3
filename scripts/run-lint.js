#!/usr/bin/env node
/**
 * Lint runner: prefer local ESLint + eslint-plugin-security when installed;
 * otherwise fall back to scripts/security-lint.js (zero-dep Gate G4 path).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['js/stage3d.js', 'js/aptabase.js', 'js/app.js'];
const eslintJs = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (res.error) {
    console.error(res.error.message);
    process.exit(1);
  }
  process.exit(res.status == null ? 1 : res.status);
}

if (fs.existsSync(eslintJs)) {
  console.log('[lint] Using local ESLint + eslint.config.mjs');
  run(process.execPath, [eslintJs, ...TARGETS]);
} else {
  console.warn('[lint] ESLint not installed — running scripts/security-lint.js fallback.');
  console.warn('[lint] When network allows: npm install  (pulls eslint + eslint-plugin-security)');
  run(process.execPath, [path.join(ROOT, 'scripts', 'security-lint.js'), ...TARGETS]);
}
