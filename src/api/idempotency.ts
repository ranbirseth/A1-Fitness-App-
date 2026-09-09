// Client-side idempotency key generation.
//
// The backend dedupes identical membership/payment operations through two
// unique indexes: `termKey` (deterministic per term) and an optional client
// `idempotencyKey`. To make a client retry genuinely retry-safe (even if it
// lands on a different millisecond and therefore a different termKey), each
// logical user operation carries ONE stable idempotencyKey that is reused for
// every HTTP attempt of that operation and cleared once it completes.
//
// We implement a RFC4122 v4 UUID — a reliable random identifier already
// available in any JS runtime — without pulling in a heavy dependency.

export function generateIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
