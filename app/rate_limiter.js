const REFILL_RATE = 1; // tokens per second
const BUCKET_SIZE = 15; // maximum number of tokens in the bucket
const REQUEST_COST = 3; // tokens consumed per request

const buckets = new Map();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
}

function checkAndConsume(ip, now = Date.now()) {
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: BUCKET_SIZE, lastRefill: now };
  }

  const elapsed = (now - bucket.lastRefill) / 1000; // convert to seconds
  const refillTokens = Math.floor(elapsed * REFILL_RATE);
  const availableTokens = Math.min(bucket.tokens + refillTokens, BUCKET_SIZE);

  if (availableTokens < REQUEST_COST) {
    buckets.set(ip, { tokens: availableTokens, lastRefill: bucket.lastRefill });
    return { allowed: false, tokensRemaining: availableTokens };
  }

  const tokensRemaining = availableTokens - REQUEST_COST;
  buckets.set(ip, { tokens: tokensRemaining, lastRefill: now });
  return { allowed: true, tokensRemaining };
}

function rateLimiterMiddleware(req, res, next) {
  const ip = getClientIp(req);
  const result = checkAndConsume(ip);

  if (!result.allowed) {
    return res.status(429).send({ error: 'Too many requests' });
  }

  return next();
}

module.exports = { checkAndConsume, rateLimiterMiddleware, getClientIp };