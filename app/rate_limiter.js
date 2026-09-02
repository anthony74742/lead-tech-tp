const { createClient } = require('redis');

const REFILL_RATE = 1; // tokens per second
const BUCKET_SIZE = 15; // maximum number of tokens in the bucket
const REQUEST_COST = 3; // tokens consumed per request

const redisClient = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT)
  }
});
redisClient.on('error', err => console.error('Redis Client Error', err));
redisClient.connect();

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
}

const TOKEN_BUCKET_SCRIPT = `
local now, size, rate, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local raw = redis.call('GET', KEYS[1])
local tokens, lastRefill = size, now
if raw then
  tokens, lastRefill = raw:match('(%d+):(%d+)')
  tokens, lastRefill = tonumber(tokens), tonumber(lastRefill)
end

tokens = math.min(tokens + math.floor((now - lastRefill) / 1000 * rate), size)
local allowed = tokens >= cost
if allowed then
  tokens = tokens - cost
  lastRefill = now
end

redis.call('SET', KEYS[1], tokens .. ':' .. lastRefill)
return (allowed and '1' or '0') .. ':' .. tokens
`;

async function checkAndConsume(ip, now = Date.now()) {
  const result = await redisClient.eval(TOKEN_BUCKET_SCRIPT, {
    keys: [ip],
    arguments: [String(now), String(BUCKET_SIZE), String(REFILL_RATE), String(REQUEST_COST)]
  });
  const [allowed, tokensRemaining] = result.split(':');
  return { allowed: allowed === '1', tokensRemaining: Number(tokensRemaining) };
}

async function rateLimiterMiddleware(req, res, next) {
  const ip = getClientIp(req);
  const result = await checkAndConsume(ip);

  if (!result.allowed) {
    return res.status(429).send({ error: 'Too many requests' });
  }

  return next();
}

module.exports = { checkAndConsume, rateLimiterMiddleware, getClientIp };
