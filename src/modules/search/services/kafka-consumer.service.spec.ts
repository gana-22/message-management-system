/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaConsumerService } from './kafka-consumer.service';
import { ElasticsearchService } from './elasticsearch.service';
import { RedisService } from '../../../helpers/redis/redis.service';
import { retryMechanism } from '../../../helpers/common/service';
import { KafkaConsumerConfig } from '../../messages/interfaces/kafka.interface';

interface KafkaRunCallback {
  eachMessage: (payload: {
    message: { value: Buffer | null };
  }) => Promise<void>;
}

const mockConsumers = new Map<
  string,
  {
    consumer: any;
    runCallback: KafkaRunCallback | null;
  }
>();

const createMockConsumer = (topic: string) => {
  const consumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation((options: KafkaRunCallback) => {
      const consumerData = mockConsumers.get(topic);
      if (consumerData) {
        consumerData.runCallback = options;
      }
      return Promise.resolve();
    }),
  };

  mockConsumers.set(topic, {
    consumer,
    runCallback: null,
  });

  return consumer;
};

const mockAdmin = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  listTopics: jest.fn().mockResolvedValue(['messages']),
  createTopics: jest.fn().mockResolvedValue(undefined),
};

const mockKafka = {
  consumer: jest.fn().mockImplementation(({ groupId }) => {
    if (groupId === 'message-indexer') {
      return createMockConsumer('messages');
    } else if (groupId === 'cache-indexer') {
      return createMockConsumer('cache');
    }
    if (groupId === 'test-group') {
      return createMockConsumer('test-topic');
    }
    return createMockConsumer('unknown');
  }),
  admin: jest.fn().mockReturnValue(mockAdmin),
};

jest.mock('../../../helpers/common/service', () => ({
  retryMechanism: jest.fn(),
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafka),
}));

describe('Kafka Consumer Service', () => {
  let service: KafkaConsumerService;
  let elasticsearchService: ElasticsearchService;
  let redisService: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConsumers.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaConsumerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string | string[]> = {
                'kafka.brokers': ['localhost:9092'],
                'kafka.messageTopic': 'messages',
                'kafka.cacheTopic': 'cache',
              };
              return config[key];
            }),
          },
        },
        {
          provide: ElasticsearchService,
          useValue: {
            indexMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<KafkaConsumerService>(KafkaConsumerService);
    elasticsearchService =
      module.get<ElasticsearchService>(ElasticsearchService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('onModuleInit', () => {
    it('should setup message and cache consumers on module init', async () => {
      await service.onModuleInit();

      const messageConsumerData = mockConsumers.get('messages');
      const cacheConsumerData = mockConsumers.get('cache');

      expect(messageConsumerData?.consumer.connect).toHaveBeenCalled();
      expect(cacheConsumerData?.consumer.connect).toHaveBeenCalled();

      expect(messageConsumerData?.consumer.subscribe).toHaveBeenCalledWith({
        topic: 'messages',
        fromBeginning: false,
      });
      expect(cacheConsumerData?.consumer.subscribe).toHaveBeenCalledWith({
        topic: 'cache',
        fromBeginning: false,
      });

      expect(messageConsumerData?.consumer.run).toHaveBeenCalled();
      expect(cacheConsumerData?.consumer.run).toHaveBeenCalled();
    });

    it('should retry setup when consumer connection fails', async () => {
      mockKafka.consumer.mockImplementationOnce(() => ({
        connect: jest
          .fn()
          .mockRejectedValueOnce(new Error('connection failed')),
        disconnect: jest.fn(),
        subscribe: jest.fn(),
        run: jest.fn(),
      }));

      (retryMechanism as jest.Mock).mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(retryMechanism).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should disconnect all consumers on module destroy', async () => {
      await service.onModuleDestroy();

      const messageConsumerData = mockConsumers.get('messages');
      const cacheConsumerData = mockConsumers.get('cache');

      expect(messageConsumerData?.consumer.disconnect).toHaveBeenCalled();
      expect(cacheConsumerData?.consumer.disconnect).toHaveBeenCalled();
    });

    it('should continue disconnecting other consumers if one fails', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      const cacheConsumerData = mockConsumers.get('cache');

      if (messageConsumerData) {
        messageConsumerData.consumer.disconnect.mockRejectedValueOnce(
          new Error('disconnect failed for messages'),
        );
      }

      await service.onModuleDestroy();

      expect(cacheConsumerData?.consumer.disconnect).toHaveBeenCalled();
    });

    it('should handle case with no consumers gracefully', async () => {
      mockConsumers.clear();

      // @ts-expect-error - accessing private field
      service.consumers = new Map();

      await service.onModuleDestroy();
    });
  });

  describe('message processing', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should process message topic messages correctly', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      expect(messageConsumerData?.runCallback).toBeDefined();

      if (!messageConsumerData?.runCallback) {
        fail('Run callback was not set for message consumer');
        return;
      }

      const message = {
        value: Buffer.from(
          JSON.stringify({
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello world',
          }),
        ),
      };

      (retryMechanism as jest.Mock).mockImplementationOnce((fn) => fn());
      await messageConsumerData.runCallback.eachMessage({ message });

      expect(retryMechanism).toHaveBeenCalled();
      expect(elasticsearchService.indexMessage).toHaveBeenCalled();
    });

    it('should process cache topic messages correctly', async () => {
      const cacheConsumerData = mockConsumers.get('cache');
      expect(cacheConsumerData?.runCallback).toBeDefined();

      if (!cacheConsumerData?.runCallback) {
        fail('Run callback was not set for cache consumer');
        return;
      }

      const cacheMessage = {
        value: Buffer.from(
          JSON.stringify({
            key: 'cache-key-1',
            value: { some: 'cached-data' },
          }),
        ),
      };

      (retryMechanism as jest.Mock).mockImplementationOnce((fn) => fn());
      await cacheConsumerData.runCallback.eachMessage({
        message: cacheMessage,
      });

      expect(retryMechanism).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalledWith('cache-key-1', {
        some: 'cached-data',
      });
    });

    it('should handle null message values', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      if (!messageConsumerData?.runCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: null,
      };

      await messageConsumerData.runCallback.eachMessage({ message });

      expect(elasticsearchService.indexMessage).not.toHaveBeenCalled();
      expect(retryMechanism).not.toHaveBeenCalled();
    });

    it('should handle message parsing errors', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      if (!messageConsumerData?.runCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: Buffer.from('invalid-json'),
      };

      await expect(
        messageConsumerData.runCallback.eachMessage({ message }),
      ).rejects.toThrow('Unexpected token');

      expect(elasticsearchService.indexMessage).not.toHaveBeenCalled();
    });

    it('should handle processor errors and not commit the offset', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      if (!messageConsumerData?.runCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: Buffer.from(
          JSON.stringify({
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello world',
          }),
        ),
      };

      (retryMechanism as jest.Mock).mockRejectedValueOnce(
        new Error('processing failed after retries'),
      );

      await expect(
        messageConsumerData.runCallback.eachMessage({ message }),
      ).rejects.toThrow('processing failed after retries');
    });

    it('should use retry mechanism with proper max retries and delay', async () => {
      const messageConsumerData = mockConsumers.get('messages');
      if (!messageConsumerData?.runCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: Buffer.from(
          JSON.stringify({
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello world',
          }),
        ),
      };

      (retryMechanism as jest.Mock).mockImplementationOnce((fn) => fn());
      await messageConsumerData.runCallback.eachMessage({ message });

      expect(retryMechanism).toHaveBeenCalledWith(
        expect.any(Function),
        10,
        3000,
      );
    });
  });

  describe('setupConsumer', () => {
    it('should properly setup a consumer with provided config', async () => {
      const config: KafkaConsumerConfig<any> = {
        topic: 'test-topic',
        groupId: 'test-group',
        fromBeginning: true,
        maxRetries: 5,
        retryDelay: 1000,
        processor: jest.fn(),
      };

      mockKafka.consumer.mockClear();

      // @ts-expect-error - accessing private method
      await service.setupConsumer(config);

      expect(mockKafka.consumer).toHaveBeenCalledWith({
        groupId: 'test-group',
      });

      const testConsumerData = mockConsumers.get('test-topic');
      expect(testConsumerData).toBeDefined();

      expect(testConsumerData?.consumer.connect).toHaveBeenCalled();
      expect(testConsumerData?.consumer.subscribe).toHaveBeenCalledWith({
        topic: 'test-topic',
        fromBeginning: true,
      });
      expect(testConsumerData?.consumer.run).toHaveBeenCalledWith(
        expect.objectContaining({
          autoCommit: false,
        }),
      );
    });

    it('should handle consumer setup failure and retry', async () => {
      const config: KafkaConsumerConfig<any> = {
        topic: 'test-topic',
        groupId: 'test-group',
        fromBeginning: false,
        maxRetries: 3,
        retryDelay: 1000,
        processor: jest.fn(),
      };

      const failingConsumer = {
        connect: jest.fn().mockRejectedValueOnce(new Error('connect failed')),
        disconnect: jest.fn(),
        subscribe: jest.fn(),
        run: jest.fn(),
      };

      mockConsumers.set('test-topic', {
        consumer: failingConsumer,
        runCallback: null,
      });

      mockKafka.consumer.mockReturnValueOnce(failingConsumer);

      (retryMechanism as jest.Mock).mockResolvedValueOnce(undefined);

      // @ts-ignore - accessing private method
      await service.setupConsumer(config);

      expect(retryMechanism).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        1000,
      );
    });

    it('should not retry if already in retry mode', async () => {
      const config: KafkaConsumerConfig<any> = {
        topic: 'test-topic',
        groupId: 'test-group',
        fromBeginning: false,
        maxRetries: 3,
        retryDelay: 1000,
        processor: jest.fn(),
      };

      const failingConsumer = {
        connect: jest.fn().mockRejectedValueOnce(new Error('connect failed')),
        disconnect: jest.fn(),
        subscribe: jest.fn(),
        run: jest.fn(),
      };

      mockConsumers.set('test-topic', {
        consumer: failingConsumer,
        runCallback: null,
      });

      mockKafka.consumer.mockReturnValueOnce(failingConsumer);

      // @ts-ignore - accessing private method
      await expect(service.setupConsumer(config, true)).rejects.toThrow(
        'connect failed',
      );

      expect(retryMechanism).not.toHaveBeenCalled();
    });
  });
});
