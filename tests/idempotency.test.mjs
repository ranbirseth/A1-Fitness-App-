// Dependency-free RN idempotency tests.
//
// The RN project has no Jest/test runtime installed, so these tests run on the
// Node built-in test runner. They exercise the REAL idempotency module by
// reading `src/api/idempotency.ts` (a single pure function with no imports) and
// performing a minimal, type-only transpile before evaluating it. This keeps
// the tests honest (they run the actual shipped logic) without adding a heavy
// dependency.
//
// Run: node --test tests/idempotency.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal transpile: strip TS variable type annotations. The idempotency module
// body is `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(...)` — the only TS
// syntax is the `: string` return annotation on the function declaration.
function loadGenerateIdempotencyKey() {
  const source = readFileSync(join(__dirname, '..', 'src', 'api', 'idempotency.ts'), 'utf8');
  const body = source
    // strip `export` so the function body is module-scope-safe for new Function
    .replace(/export\s+function/g, 'function')
    // strip the ': string' return type and any ': xxx' param/return annotations
    .replace(/:\s*[A-Za-z][\w<>, |\[\]]*\s*=/g, ' =')
    .replace(/\):\s*string\s*\{/, ') {');
  // Wrap so the function is defined in scope.
  const wrapped = new Function(`${body}; return generateIdempotencyKey;`);
  return wrapped();
}

const generateIdempotencyKey = loadGenerateIdempotencyKey();

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('generateIdempotencyKey returns a valid RFC4122 v4 UUID', () => {
  const key = generateIdempotencyKey();
  assert.match(key, UUID_V4_RE, `key "${key}" should be a v4 UUID`);
});

test('generateIdempotencyKey produces unique keys across calls', () => {
  const keys = new Set();
  for (let i = 0; i < 1000; i++) keys.add(generateIdempotencyKey());
  assert.equal(keys.size, 1000, 'all generated keys should be unique');
});

test('a stable key allows backend dedup (reuse, not regenerate, per operation)', () => {
  // The operational contract: ONE logical operation keeps ONE key so a retry
  // of the same request carries the same idempotencyKey. This test locks the
  // format + uniqueness that the calling component relies on; stability is
  // enforced by the component holding the value in a ref across retries.
  const first = generateIdempotencyKey();
  const second = generateIdempotencyKey();
  assert.notEqual(first, second, 'distinct operations must have distinct keys');
  assert.match(first, UUID_V4_RE);
});
