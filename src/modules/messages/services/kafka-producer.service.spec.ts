/* eslint-disable @typescript-eslint/no-unused-vars */
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
                'kafka.topic': 'messages',
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
    it('should connect to Kafka and create topic if it does not exist', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce([]);

      await service.onModuleInit();

      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.createTopics).toHaveBeenCalledWith({
        topics: [
          {
            topic: 'messages',
            numPartitions: 3,
            replicationFactor: 1,
          },
        ],
      });
      expect(mockAdmin.disconnect).toHaveBeenCalled();
    });

    it('should not create topic if it already exists', async () => {
      mockAdmin.listTopics.mockResolvedValueOnce(['messages']);

      await service.onModuleInit();

      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockAdmin.connect).toHaveBeenCalled();
      expect(mockAdmin.listTopics).toHaveBeenCalled();
      expect(mockAdmin.createTopics).not.toHaveBeenCalled();
      expect(mockAdmin.disconnect).toHaveBeenCalled();
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

  describe('publishMessage', () => {
    it('should publish message to Kafka topic', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await service.publishMessage(message);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'messages',
        messages: [
          {
            key: 'msg-1',
            value: JSON.stringify(message),
          },
        ],
      });
    });

    it('should throw an error if publishing fails', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      mockProducer.send.mockRejectedValueOnce(new Error('publish failed'));

      await expect(service.publishMessage(message)).rejects.toThrow(
        'publish failed',
      );
    });
  });
});
