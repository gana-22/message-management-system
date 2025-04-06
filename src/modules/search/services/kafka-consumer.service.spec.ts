/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaConsumerService } from './kafka-consumer.service';
import { ElasticsearchService } from './elasticsearch.service';
import * as helpers from '../../../helpers/service';

interface KafkaRunCallback {
  eachMessage: (payload: {
    message: { value: Buffer | null };
  }) => Promise<void>;
}

const mockConsumer = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  run: jest.fn().mockImplementation((options: KafkaRunCallback) => {
    mockRunCallback = options;
    return Promise.resolve();
  }),
};

let mockRunCallback: KafkaRunCallback | null = null;

const mockAdmin = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  listTopics: jest.fn().mockResolvedValue(['existing-topic']),
  createTopics: jest.fn().mockResolvedValue(undefined),
};

const mockKafka = {
  consumer: jest.fn().mockReturnValue(mockConsumer),
  admin: jest.fn().mockReturnValue(mockAdmin),
};

jest.mock('../../../helpers/service', () => ({
  retryMechanism: jest.fn(),
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafka),
}));

describe('Kafka Consumer Service', () => {
  let service: KafkaConsumerService;
  let elasticsearchService: ElasticsearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRunCallback = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaConsumerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string | string[]> = {
                'kafka.brokers': ['localhost:9092'],
                'kafka.topic': 'messages',
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
      ],
    }).compile();

    service = module.get<KafkaConsumerService>(KafkaConsumerService);
    elasticsearchService =
      module.get<ElasticsearchService>(ElasticsearchService);
  });

  describe('onModuleInit', () => {
    it('should setup consumer on module init', async () => {
      await service.onModuleInit();

      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'messages',
        fromBeginning: false,
      });
      expect(mockConsumer.run).toHaveBeenCalled();
      expect(mockAdmin.disconnect).toHaveBeenCalled();
    });

    it('should create topic if it does not exist', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);

      await service.onModuleInit();

      expect(mockAdmin.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'messages',
            numPartitions: 3,
            replicationFactor: 1,
          },
        ],
      });
    });

    it('should retry setup if connection fails', async () => {
      mockConsumer.connect.mockRejectedValueOnce(
        new Error('connection failed'),
      );

      (helpers.retryMechanism as jest.Mock).mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(helpers.retryMechanism).toHaveBeenCalled();
    });

    it('should retry if topic does not exist and its a retry attempt', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);

      (helpers.retryMechanism as jest.Mock).mockResolvedValueOnce(undefined);

      type PrivateServiceMethods = {
        setupConsumer: (isRetry: boolean) => Promise<void>;
      };

      const privateService = service as unknown as PrivateServiceMethods;
      const setupConsumerMethod = privateService.setupConsumer.bind(service);

      await setupConsumerMethod(true);

      expect(helpers.retryMechanism).toHaveBeenCalled();
    });

    it('should handle topic creation failure gracefully', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);

      mockAdmin.createTopics.mockRejectedValueOnce(
        new Error('Create topic failed'),
      );

      await service.onModuleInit();

      expect(mockConsumer.subscribe).toHaveBeenCalled();
      expect(mockConsumer.run).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect consumer on module destroy', async () => {
      await service.onModuleDestroy();

      expect(mockConsumer.disconnect).toHaveBeenCalled();
    });

    it('should throw error if disconnect fails', async () => {
      mockConsumer.disconnect.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );

      await expect(service.onModuleDestroy()).rejects.toThrow(
        'disconnect failed',
      );
    });
  });

  describe('message processing', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should process messages correctly', async () => {
      expect(mockRunCallback).toBeDefined();

      if (!mockRunCallback) {
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

      await mockRunCallback.eachMessage({ message });

      expect(elasticsearchService.indexMessage).toHaveBeenCalled();
    });

    it('should handle null message values', async () => {
      if (!mockRunCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: null,
      };

      await mockRunCallback.eachMessage({ message });

      expect(elasticsearchService.indexMessage).not.toHaveBeenCalled();
    });

    it('should handle message parsing errors', async () => {
      if (!mockRunCallback) {
        fail('Run callback was not set');
        return;
      }

      const message = {
        value: Buffer.from('invalid-json'),
      };

      await mockRunCallback.eachMessage({ message });

      expect(elasticsearchService.indexMessage).not.toHaveBeenCalled();
    });
  });
});
