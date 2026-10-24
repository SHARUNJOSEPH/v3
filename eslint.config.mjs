/**
 * PixelMap ESLint flat config (ESLint 9+).
 * Targets: js/stage3d.js, js/aptabase.js, js/app.js
 * Security-first; noisy rules warn (esp. on the ~10k-line app.js).
 *
 * Install: npm install  (needs eslint + eslint-plugin-security as devDependencies)
 * Run:    npm run lint
 */
import security from 'eslint-plugin-security';

const browserGlobals = {
  // Browser / DOM
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  AbortController: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  HTMLElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  CanvasRenderingContext2D: 'readonly',
  Image: 'readonly',
  ImageData: 'readonly',
  Path2D: 'readonly',
  DOMParser: 'readonly',
  XMLSerializer: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  Node: 'readonly',
  NodeFilter: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  crypto: 'readonly',
  performance: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queue: 'readonly',
  structuredClone: 'readonly',
  CSS: 'readonly',
  // Vendor / app globals (loaded via script tags — see CLAUDE.md)
  THREE: 'readonly',
  firebase: 'readonly',
  bootstrap: 'readonly',
  jspdf: 'readonly',
  jsPDF: 'readonly',
  Aptabase: 'readonly',
  PixelMap3D: 'readonly',
  __FIREBASE_CONFIG__: 'readonly',
  __IS_DEMO__: 'writable',
  state: 'writable',
};

/** Shared security rule levels — errors for high-signal, warn for noisy. */
const securityRules = {
  ...security.configs.recommended.rules,
  // Extremely noisy on large DOM/state code; keep as warn baseline for Gate G4
  'security/detect-object-injection': 'warn',
  'security/detect-non-literal-fs-filename': 'warn',
  'security/detect-non-literal-require': 'warn',
  // High-signal — keep as errors
  'security/detect-eval-with-expression': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-child-process': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-possible-timing-attacks': 'warn',
  'security/detect-non-literal-regexp': 'warn',
  'security/detect-bidi-characters': 'error',
};

export default [
  {
    ignores: [
      'js/vendor/**',
      'js/main.js',
      'public/**',
      'node_modules/**',
      'scripts/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['js/stage3d.js', 'js/aptabase.js', 'js/app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals,
    },
    plugins: {
      security,
    },
    rules: {
      // Keep core style rules quiet — this wave is security-focused
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'no-redeclare': 'warn',
      ...securityRules,
    },
  },
  // Extra noise control for the monolith — same rules, but object-injection stays warn
  {
    files: ['js/app.js'],
    rules: {
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'no-redeclare': 'warn',
    },
  },
];
