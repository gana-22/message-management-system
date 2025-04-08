import configuration from './configuration';

describe('Configuration', () => {
  const currentEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...currentEnv };
  });

  afterAll(() => {
    process.env = currentEnv;
  });

  describe('Configuration Settings', () => {
    it('should return default configuration when no env variables are set', () => {
      delete process.env.PORT;
      delete process.env.MONGODB_URI;
      delete process.env.KAFKA_BROKERS;
      delete process.env.KAFKA_MESSAGE_TOPIC;
      delete process.env.ELASTICSEARCH_NODE;
      delete process.env.ELASTICSEARCH_INDEX;
      delete process.env.ELASTICSEARCH_SHARD;
      delete process.env.ELASTICSEARCH_REPLICA;
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_CACHE_TTL;

      const config = configuration();

      expect(config.port).toBe(3000);
      expect(config.mongodb.uri).toBe('mongodb://localhost:27017/message-db');
      expect(config.kafka.brokers).toEqual(['localhost:9092']);
      expect(config.kafka.messageTopic).toBe('messages');
      expect(config.elasticsearch.node).toBe('http://localhost:9200');
      expect(config.elasticsearch.index).toBe('messages');
      expect(config.elasticsearch.shards).toBe(1);
      expect(config.elasticsearch.replicas).toBe(0);
      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.redis.ttl).toBe(60);
    });

    it('should use provided environment variables', () => {
      process.env.PORT = '4000';
      process.env.MONGODB_URI = 'mongodb://testhost:27017/test-db';
      process.env.KAFKA_BROKERS = 'broker1:9092,broker2:9092';
      process.env.KAFKA_MESSAGE_TOPIC = 'test-topic';
      process.env.ELASTICSEARCH_NODE = 'http://es-test:9200';
      process.env.ELASTICSEARCH_INDEX = 'test-index';
      process.env.ELASTICSEARCH_SHARD = '3';
      process.env.ELASTICSEARCH_REPLICA = '2';
      process.env.REDIS_HOST = 'redis-test';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_CACHE_TTL = '120';

      const config = configuration();

      expect(config.port).toBe(4000);
      expect(config.mongodb.uri).toBe('mongodb://testhost:27017/test-db');
      expect(config.kafka.brokers).toEqual(['broker1:9092', 'broker2:9092']);
      expect(config.kafka.messageTopic).toBe('test-topic');
      expect(config.elasticsearch.node).toBe('http://es-test:9200');
      expect(config.elasticsearch.index).toBe('test-index');
      expect(config.elasticsearch.shards).toBe(3);
      expect(config.elasticsearch.replicas).toBe(2);
      expect(config.redis.host).toBe('redis-test');
      expect(config.redis.port).toBe(6380);
      expect(config.redis.ttl).toBe(120);
    });

    it('should handle partial environment variable configuration', () => {
      process.env.PORT = '5000';
      process.env.KAFKA_MESSAGE_TOPIC = 'partial-topic';
      process.env.REDIS_CACHE_TTL = '300';

      const config = configuration();

      expect(config.port).toBe(5000);
      expect(config.mongodb.uri).toBe('mongodb://localhost:27017/message-db');
      expect(config.kafka.brokers).toEqual(['localhost:9092']);
      expect(config.kafka.messageTopic).toBe('partial-topic');
      expect(config.elasticsearch.node).toBe('http://localhost:9200');
      expect(config.redis.ttl).toBe(300);
    });

    it('should match numeric values correctly', () => {
      process.env.PORT = '8080';
      process.env.ELASTICSEARCH_SHARD = '5';
      process.env.REDIS_PORT = '6381';
      process.env.REDIS_CACHE_TTL = '600';

      const config = configuration();

      expect(config.port).toBe(8080);
      expect(config.elasticsearch.shards).toBe(5);
      expect(config.redis.port).toBe(6381);
      expect(config.redis.ttl).toBe(600);

      expect(typeof config.elasticsearch.shards).toBe('number');
      expect(typeof config.port).toBe('number');
      expect(typeof config.redis.port).toBe('number');
      expect(typeof config.redis.ttl).toBe('number');
    });
  });
});
