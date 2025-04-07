/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Mock redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

// Mock redis module
jest.mock('redis', () => ({
  createClient: jest.fn().mockImplementation(() => mockRedisClient),
}));

// Now import redis after the mock is set up
import * as redis from 'redis';

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                'redis.host': 'localhost',
                'redis.port': 6379,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize redis client with correct configuration', async () => {
      await service.onModuleInit();

      expect(configService.get).toHaveBeenCalledWith('redis.host');
      expect(configService.get).toHaveBeenCalledWith('redis.port');
      expect(redis.createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    it('should throw an error if redis connection fails', async () => {
      mockRedisClient.connect.mockRejectedValueOnce(
        new Error('Connection failed'),
      );

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect the redis client', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });

    it('should throw an error if disconnect fails', async () => {
      await service.onModuleInit();
      mockRedisClient.disconnect.mockRejectedValueOnce(
        new Error('Disconnect failed'),
      );

      await expect(service.onModuleDestroy()).rejects.toThrow(
        'Disconnect failed',
      );
    });
  });

  describe('get', () => {
    it('should return null if key not found', async () => {
      await service.onModuleInit();
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await service.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toBeNull();
    });

    it('should return parsed value if key exists', async () => {
      await service.onModuleInit();
      const mockData = { a: 'b' };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockData));

      const result = await service.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(mockData);
    });

    it('should throw an error if get operation fails', async () => {
      await service.onModuleInit();
      mockRedisClient.get.mockRejectedValueOnce(new Error('Get failed'));

      await expect(service.get('test-key')).rejects.toThrow('Get failed');
    });
  });

  describe('set', () => {
    beforeEach(() => {
      process.env.REDIS_CACHE_TTL = '60';
    });

    it('should set value with default TTL', async () => {
      await service.onModuleInit();
      const mockData = { a: 'b' };

      await service.set('test-key', mockData);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test-key',
        60,
        JSON.stringify(mockData),
      );
    });

    it('should set value with custom TTL', async () => {
      await service.onModuleInit();
      const mockData = { a: 'b' };

      await service.set('test-key', mockData, 120);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test-key',
        120,
        JSON.stringify(mockData),
      );
    });

    it('should throw an error if set operation fails', async () => {
      await service.onModuleInit();
      mockRedisClient.setEx.mockRejectedValueOnce(new Error('Set failed'));

      await expect(service.set('test-key', { a: 'b' })).rejects.toThrow(
        'Set failed',
      );
    });
  });

  describe('del', () => {
    it('should delete the key from Redis', async () => {
      await service.onModuleInit();

      await service.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should not throw if delete operation fails', async () => {
      await service.onModuleInit();
      mockRedisClient.del.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(service.del('test-key')).resolves.not.toThrow();
    });
  });

  describe('deleteKeysByPattern', () => {
    it('should delete multiple keys matching a pattern', async () => {
      await service.onModuleInit();
      const mockKeys = ['key1', 'key2', 'key3'];
      mockRedisClient.keys.mockResolvedValueOnce(mockKeys);

      await service.deleteKeysByPattern('key*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('key*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(mockKeys);
    });

    it('should not call del if no keys match pattern', async () => {
      await service.onModuleInit();
      mockRedisClient.keys.mockResolvedValueOnce([]);

      await service.deleteKeysByPattern('key*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('key*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should not throw if operation fails', async () => {
      await service.onModuleInit();
      mockRedisClient.keys.mockRejectedValueOnce(new Error('Keys failed'));

      await expect(service.deleteKeysByPattern('key*')).resolves.not.toThrow();
    });
  });
});
