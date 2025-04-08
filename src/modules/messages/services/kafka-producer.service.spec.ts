/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';
import { Kafka } from 'kafkajs';

jest.mock('kafkajs', () => {
  const mockProducer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  };

  const mockAdmin = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    listTopics: jest.fn(),
    createTopics: jest.fn(),
  };

  return {
    Kafka: jest.fn().mockImplementation(() => ({
      producer: jest.fn().mockReturnValue(mockProducer),
      admin: jest.fn().mockReturnValue(mockAdmin),
    })),
  };
});

describe('Kafka Producer Service', () => {
  let service: KafkaProducerService;
  let configService: ConfigService;
  let mockKafka;
  let mockProducer;
  let mockAdmin;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaProducerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                'kafka.brokers': ['localhost:9092'],
                'kafka.messageTopic': 'messages',
                'kafka.cacheTopic': 'cache',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KafkaProducerService>(KafkaProducerService);
    configService = module.get<ConfigService>(ConfigService);

    mockKafka = new Kafka({ clientId: 'test', brokers: ['localhost:9092'] });
    mockProducer = mockKafka.producer();
    mockAdmin = mockKafka.admin();
  });

  describe('onModuleInit', () => {
    it('should connect to Kafka producer', async () => {
      await service.onModuleInit();

      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should throw an error if Kafka connection fails', async () => {
      mockProducer.connect.mockRejectedValueOnce(new Error('connect failed'));

      await expect(service.onModuleInit()).rejects.toThrow('connect failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from Kafka', async () => {
      await service.onModuleDestroy();

      expect(mockProducer.disconnect).toHaveBeenCalled();
    });

    it('should throw an error if disconnect fails', async () => {
      mockProducer.disconnect.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );

      await expect(service.onModuleDestroy()).rejects.toThrow(
        'disconnect failed',
      );
    });
  });

  describe('ensureTopicExists', () => {
    it('should create topic if it does not exist', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);

      await service['ensureTopicExists']('test-topic');

      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'test-topic',
            numPartitions: 3,
            replicationFactor: 1,
          },
        ],
      });
      expect(mockAdmin.disconnect).toHaveBeenCalled();
    });

    it('should not create topic if it already exists', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce(['test-topic']);

      await service['ensureTopicExists']('test-topic');

      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.createTopics).not.toHaveBeenCalled();
      expect(mockAdmin.disconnect).toHaveBeenCalled();
    });

    it('should throw an error if admin connection fails', async () => {
      mockAdmin.connect.mockRejectedValueOnce(
        new Error('admin connect failed'),
      );

      await expect(service['ensureTopicExists']('test-topic')).rejects.toThrow(
        'admin connect failed',
      );
    });

    it('should throw an error if listTopics fails', async () => {
      mockAdmin.connect.mockResolvedValueOnce();
      mockAdmin.listTopics.mockRejectedValueOnce(
        new Error('listTopics failed'),
      );

      await expect(service['ensureTopicExists']('test-topic')).rejects.toThrow(
        'listTopics failed',
      );
    });

    it('should throw an error if createTopics fails', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);
      mockAdmin.createTopics.mockRejectedValueOnce(
        new Error('createTopics failed'),
      );

      await expect(service['ensureTopicExists']('test-topic')).rejects.toThrow(
        'createTopics failed',
      );
    });
  });

  describe('sendMessage', () => {
    it('should ensure topic exists and send message to topic', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce(['test-topic']);

      const message = {
        topic: 'test-topic',
        key: 'test-key',
        data: { foo: 'bar' },
      };

      await service['sendMessage'](message);

      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          {
            key: 'test-key',
            value: JSON.stringify({ foo: 'bar' }),
          },
        ],
      });
    });

    it('should throw an error if sending fails', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce(['test-topic']);
      mockProducer.send.mockRejectedValueOnce(new Error('send failed'));

      const message = {
        topic: 'test-topic',
        key: 'test-key',
        data: { foo: 'bar' },
      };

      await expect(service['sendMessage'](message)).rejects.toThrow(
        'send failed',
      );
    });
  });

  describe('publishMessage', () => {
    it('should publish message to Kafka message topic', async () => {
      jest
        .spyOn(service as any, 'sendMessage')
        .mockResolvedValueOnce(undefined);

      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await service.publishMessage(message);

      expect(service['sendMessage']).toHaveBeenCalledWith({
        topic: 'messages',
        key: 'msg-1',
        data: message,
      });
    });

    it('should throw an error if sendMessage fails', async () => {
      jest
        .spyOn(service as any, 'sendMessage')
        .mockRejectedValueOnce(new Error('sendMessage failed'));

      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await expect(service.publishMessage(message)).rejects.toThrow(
        'sendMessage failed',
      );
    });
  });

  describe('publishCache', () => {
    it('should publish cache data to Kafka cache topic', async () => {
      jest
        .spyOn(service as any, 'sendMessage')
        .mockResolvedValueOnce(undefined);

      const key = 'cache-key';
      const value = { data: 'cache-value' };

      await service.publishCache(key, value);

      expect(service['sendMessage']).toHaveBeenCalledWith({
        topic: 'cache',
        key: 'cache-key',
        data: {
          key: 'cache-key',
          value: { data: 'cache-value' },
        },
      });
    });

    it('should throw an error if sendMessage fails for cache', async () => {
      jest
        .spyOn(service as any, 'sendMessage')
        .mockRejectedValueOnce(new Error('cache sendMessage failed'));

      const key = 'cache-key';
      const value = { data: 'cache-value' };

      await expect(service.publishCache(key, value)).rejects.toThrow(
        'cache sendMessage failed',
      );
    });
  });

  describe('configurations', () => {
    it('should handle empty brokers configuration', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key) => {
        if (key === 'kafka.brokers') return [];
        if (key === 'kafka.messageTopic') return 'messages';
        if (key === 'kafka.cacheTopic') return 'cache';
        return null;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KafkaProducerService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<KafkaProducerService>(KafkaProducerService);

      expect(newService['brokers']).toEqual([]);
    });

    it('should handle empty topic configuration', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key) => {
        if (key === 'kafka.brokers') return ['localhost:9092'];
        if (key === 'kafka.messageTopic') return '';
        if (key === 'kafka.cacheTopic') return '';
        return null;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KafkaProducerService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<KafkaProducerService>(KafkaProducerService);

      expect(newService['messageTopic']).toEqual('');
      expect(newService['cacheTopic']).toEqual('');
    });

    it('should handle undefined topic configuration', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key) => {
        if (key === 'kafka.brokers') return ['localhost:9092'];
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KafkaProducerService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const newService = module.get<KafkaProducerService>(KafkaProducerService);

      expect(newService['messageTopic']).toEqual('');
      expect(newService['cacheTopic']).toEqual('');
    });
  });
});
