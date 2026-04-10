import { SessionService } from '../session.service';

/** Mock ioredis client */
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  decr: jest.fn(),
  rpush: jest.fn(),
  lrange: jest.fn(),
  zadd: jest.fn(),
  zcard: jest.fn(),
  zrange: jest.fn(),
  zremrangebyscore: jest.fn(),
  pipeline: jest.fn(),
};

// Pipeline mock
const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    service = new SessionService(mockRedis as any);
  });

  describe('generic operations', () => {
    it('get should parse JSON from Redis', async () => {
      mockRedis.get.mockResolvedValue('{"name":"test"}');
      const result = await service.get<{ name: string }>('key');
      expect(result).toEqual({ name: 'test' });
    });

    it('get should return null for missing key', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });

    it('get should return null for invalid JSON', async () => {
      mockRedis.get.mockResolvedValue('not-json{{{');
      const result = await service.get('bad');
      expect(result).toBeNull();
    });

    it('set should stringify and store with TTL', async () => {
      await service.set('key', { foo: 'bar' }, 3600);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'key',
        '{"foo":"bar"}',
        'EX',
        3600,
      );
    });

    it('set should store without TTL if not specified', async () => {
      await service.set('key', { foo: 'bar' });
      expect(mockRedis.set).toHaveBeenCalledWith('key', '{"foo":"bar"}');
    });

    it('del should delete key', async () => {
      await service.del('key');
      expect(mockRedis.del).toHaveBeenCalledWith('key');
    });

    it('exists should return boolean', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.exists('key')).toBe(true);

      mockRedis.exists.mockResolvedValue(0);
      expect(await service.exists('missing')).toBe(false);
    });
  });

  describe('user session', () => {
    it('setUserSession should store with 7-day TTL', async () => {
      await service.setUserSession('tg-123', 'user-abc');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'session:tg-123',
        'user-abc',
        'EX',
        7 * 24 * 60 * 60,
      );
    });

    it('getUserSession should return userId', async () => {
      mockRedis.get.mockResolvedValue('user-abc');
      const result = await service.getUserSession('tg-123');
      expect(result).toBe('user-abc');
    });

    it('touchSession should refresh TTL', async () => {
      await service.touchSession('tg-123');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'session:tg-123',
        7 * 24 * 60 * 60,
      );
    });
  });

  describe('voice credits', () => {
    it('getVoiceRemaining should return parsed int', async () => {
      mockRedis.get.mockResolvedValue('2');
      expect(await service.getVoiceRemaining('user-1')).toBe(2);
    });

    it('getVoiceRemaining should default to 3', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await service.getVoiceRemaining('user-new')).toBe(3);
    });

    it('decrementVoice should initialize and return 2 for new users', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await service.decrementVoice('user-new');
      expect(result).toBe(2);
      expect(mockRedis.set).toHaveBeenCalledWith('voice_remaining:user-new', '2');
    });

    it('decrementVoice should decrement existing value', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.decr.mockResolvedValue(1);
      const result = await service.decrementVoice('user-1');
      expect(result).toBe(1);
    });
  });

  describe('rate limiting', () => {
    it('should allow when under limit', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],  // zremrangebyscore
        [null, 3],  // zcard → 3 current requests
        [null, 1],  // zadd
        [null, 1],  // expire
      ]);

      const result = await service.checkRateLimit('user-1', 'message', 20);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(16); // 20 - 3 - 1
    });

    it('should block when at limit', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 20], // zcard → at limit
        [null, 1],
        [null, 1],
      ]);
      mockRedis.zrange.mockResolvedValue([
        'req1',
        String(Date.now() - 30000),
      ]);

      const result = await service.checkRateLimit('user-1', 'message', 20);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('conversation context', () => {
    it('pushConversationMessage should rpush and set TTL', async () => {
      await service.pushConversationMessage('conv-1', {
        role: 'user',
        content: 'hello',
      });

      expect(mockRedis.rpush).toHaveBeenCalledWith(
        'conversation:conv-1:ctx',
        '{"role":"user","content":"hello"}',
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'conversation:conv-1:ctx',
        3600,
      );
    });

    it('getConversationContext should parse messages', async () => {
      mockRedis.lrange.mockResolvedValue([
        '{"role":"user","content":"hi"}',
        '{"role":"assistant","content":"hello!"}',
      ]);

      const messages = await service.getConversationContext('conv-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].content).toBe('hello!');
    });

    it('clearConversationContext should delete key', async () => {
      await service.clearConversationContext('conv-1');
      expect(mockRedis.del).toHaveBeenCalledWith('conversation:conv-1:ctx');
    });
  });
});
