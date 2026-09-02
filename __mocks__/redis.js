// Manual mock used by Jest for any `require('redis')` in tests,
// so rate_limiter tests don't need a real Redis instance running.
function createClient() {
  const store = new Map();

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn(async key => store.get(key) || null),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
      return 'OK';
    }),
    // Mimics the token-bucket Lua script used by checkAndConsume: real Redis
    // runs a script to completion without interleaving other commands, so
    // this reproduces that atomicity by doing the whole read-modify-write
    // synchronously (no `await` in between) before resolving.
    eval: jest.fn(async (_script, { keys: [key], arguments: [now, size, rate, cost] }) => {
      now = Number(now);
      size = Number(size);
      rate = Number(rate);
      cost = Number(cost);

      const raw = store.get(key) || null;
      let [tokens, lastRefill] = raw ? raw.split(':').map(Number) : [size, now];

      tokens = Math.min(tokens + Math.floor((now - lastRefill) / 1000 * rate), size);
      const allowed = tokens >= cost;
      if (allowed) {
        tokens -= cost;
        lastRefill = now;
      }

      store.set(key, `${tokens}:${lastRefill}`);
      return `${allowed ? '1' : '0'}:${tokens}`;
    })
  };
}

module.exports = { createClient };
