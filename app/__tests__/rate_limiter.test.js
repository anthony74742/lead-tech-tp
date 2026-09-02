const {
  checkAndConsume,
  rateLimiterMiddleware,
  getClientIp
} = require('../../app/rate_limiter');

describe('getClientIp(req)', () => {
  test('should return the x-forwarded-for header when present', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      connection: {},
      socket: {}
    };
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  test('should fall back to connection.remoteAddress', () => {
    const req = {
      headers: {},
      connection: { remoteAddress: '5.6.7.8' },
      socket: {}
    };
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  test('should fall back to socket.remoteAddress', () => {
    const req = {
      headers: {},
      connection: {},
      socket: { remoteAddress: '9.10.11.12' }
    };
    expect(getClientIp(req)).toBe('9.10.11.12');
  });

  test('should fall back to connection.socket.remoteAddress', () => {
    const req = {
      headers: {},
      connection: { socket: { remoteAddress: '13.14.15.16' } },
      socket: {}
    };
    expect(getClientIp(req)).toBe('13.14.15.16');
  });

  test('should return null when no address can be found', () => {
    const req = { headers: {}, connection: {}, socket: {} };
    expect(getClientIp(req)).toBeNull();
  });
});

describe('checkAndConsume(ip, now)', () => {
  test('should allow a request from a fresh bucket and consume tokens', async () => {
    const result = await checkAndConsume('1.1.1.1', 1000);
    expect(result).toEqual({ allowed: true, tokensRemaining: 12 });
  });

  test('should deny a request when the bucket runs out of tokens', async () => {
    const ip = '2.2.2.2';
    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 allowed requests before the 6th is denied
    for (let i = 0; i < 5; i++) {
      await checkAndConsume(ip, 1000);
    }
    const result = await checkAndConsume(ip, 1000);
    expect(result).toEqual({ allowed: false, tokensRemaining: 0 });
  });

  test('should refill tokens over time up to the bucket size', async () => {
    const ip = '3.3.3.3';
    for (let i = 0; i < 5; i++) {
      await checkAndConsume(ip, 1000);
    }
    const denied = await checkAndConsume(ip, 1000);
    expect(denied.allowed).toBe(false);

    // 20 seconds later there should be enough refilled tokens (capped at BUCKET_SIZE)
    const result = await checkAndConsume(ip, 21000);
    expect(result).toEqual({ allowed: true, tokensRemaining: 12 });
  });
});

describe('checkAndConsume(ip, now) under concurrent load', () => {
  test('should only allow 5 requests when 20 requests hit the same IP simultaneously', async () => {
    const ip = 'concurrent.1.1.1';
    const now = 1000;

    // Fire 20 concurrent requests at the same instant against a fresh bucket.
    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 requests should be allowed, 15 denied.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkAndConsume(ip, now))
    );

    const allowedCount = results.filter(r => r.allowed).length;
    expect(allowedCount).toBe(5);
  });

  test('should not allow more than BUCKET_SIZE/REQUEST_COST requests across a burst of 100 concurrent hits', async () => {
    const ip = 'concurrent.2.2.2';
    const now = 2000;

    const results = await Promise.all(
      Array.from({ length: 100 }, () => checkAndConsume(ip, now))
    );

    const allowedCount = results.filter(r => r.allowed).length;
    expect(allowedCount).toBeLessThanOrEqual(5);
  });
});

describe('rateLimiterMiddleware(req, res, next)', () => {
  function makeReqRes(ip) {
    const req = {
      headers: { 'x-forwarded-for': ip },
      connection: {},
      socket: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test('should call next() when the request is allowed', async () => {
    const { req, res, next } = makeReqRes('4.4.4.4');
    await rateLimiterMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should respond with 429 when the request is rate limited', async () => {
    const { req, res, next } = makeReqRes('5.5.5.5');
    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 allowed requests before the 6th is denied
    for (let i = 0; i < 6; i++) {
      await rateLimiterMiddleware(req, res, next);
    }
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith({ error: 'Too many requests' });
  });
});
