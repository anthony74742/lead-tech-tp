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
  test('should allow a request from a fresh bucket and consume tokens', () => {
    const result = checkAndConsume('1.1.1.1', 1000);
    expect(result).toEqual({ allowed: true, tokensRemaining: 12 });
  });

  test('should deny a request when the bucket runs out of tokens', () => {
    const ip = '2.2.2.2';
    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 allowed requests before the 6th is denied
    for (let i = 0; i < 5; i++) {
      checkAndConsume(ip, 1000);
    }
    const result = checkAndConsume(ip, 1000);
    expect(result).toEqual({ allowed: false, tokensRemaining: 0 });
  });

  test('should refill tokens over time up to the bucket size', () => {
    const ip = '3.3.3.3';
    for (let i = 0; i < 5; i++) {
      checkAndConsume(ip, 1000);
    }
    const denied = checkAndConsume(ip, 1000);
    expect(denied.allowed).toBe(false);

    // 20 seconds later there should be enough refilled tokens (capped at BUCKET_SIZE)
    const result = checkAndConsume(ip, 21000);
    expect(result).toEqual({ allowed: true, tokensRemaining: 12 });
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

  test('should call next() when the request is allowed', () => {
    const { req, res, next } = makeReqRes('4.4.4.4');
    rateLimiterMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should respond with 429 when the request is rate limited', () => {
    const { req, res, next } = makeReqRes('5.5.5.5');
    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 allowed requests before the 6th is denied
    for (let i = 0; i < 6; i++) {
      rateLimiterMiddleware(req, res, next);
    }
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith({ error: 'Too many requests' });
  });
});
