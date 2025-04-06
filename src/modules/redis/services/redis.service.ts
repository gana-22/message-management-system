/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {}

  // initialize redis client
  async onModuleInit() {
    try {
      const host = this.configService.get<string>('redis.host');
      const port = this.configService.get<number>('redis.port');

      this.client = createClient({
        url: `redis://${host}:${port}`,
      });

      this.client.on('error', (err: Error) =>
        this.logger.error('Redis Client Error', err),
      );

      await this.client.connect();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Redis client: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // disconnect redis client upon receiving termination signal
  async onModuleDestroy() {
    try {
      await this.client.disconnect();
      this.logger.log('Redis client disconnected successfully');
    } catch (error) {
      this.logger.error(
        `Failed to disconnect redis: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // get cached value from Redis
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        this.logger.log(`Cached value not found`);
        return null;
      }

      this.logger.log(`Value is cached`);
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(
        `Error getting value from Redis: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // cache the value to Redis
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const jsonData = JSON.stringify(value);

      ttl = ttl || Number(process.env.REDIS_CACHE_TTL);

      await this.client.setEx(key, ttl, jsonData);
      this.logger.log(`Value cached to Redis`);
    } catch (error) {
      this.logger.error(
        `Error setting cache to Redis: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // delete the cache from Redis
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.logger.log(`Cache deleted from Redis`);
    } catch (error) {
      this.logger.error(
        `Error deleting from Redis: ${error?.message || error}`,
      );
    }
  }

  // delete the cache by pattern from Redis
  async deleteKeysByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.log(
          `Deleted ${keys.length} cache keys matching pattern: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error deleting keys by pattern: ${error?.message || error}`,
      );
    }
  }
}
