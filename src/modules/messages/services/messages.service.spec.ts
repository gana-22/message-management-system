import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { MessageRepository } from '../repositories/message.repository';
import { KafkaProducerService } from './kafka-producer.service';
import { ElasticsearchService } from '../../search/services/elasticsearch.service';
import { RedisService } from '../../redis/services/redis.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { SearchMessagesDto } from '../dto/search-messages.dto';
import { Message } from '../schemas/message.schema';

describe('Message Service', () => {
  let service: MessagesService;
  let messageRepository: MessageRepository;
  let kafkaProducerService: KafkaProducerService;
  let elasticsearchService: ElasticsearchService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: MessageRepository,
          useValue: {
            create: jest.fn(),
            findByConversationId: jest.fn(),
          },
        },
        {
          provide: KafkaProducerService,
          useValue: {
            publishMessage: jest.fn(),
          },
        },
        {
          provide: ElasticsearchService,
          useValue: {
            searchMessages: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            deleteKeysByPattern: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    messageRepository = module.get<MessageRepository>(MessageRepository);
    kafkaProducerService =
      module.get<KafkaProducerService>(KafkaProducerService);
    elasticsearchService =
      module.get<ElasticsearchService>(ElasticsearchService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('createMessage', () => {
    it('should create a new message then publish to Kafka while invalidating cache', async () => {
      const createMessageDto: CreateMessageDto = {
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
      };

      const createdMessage: Message = {
        id: 'msg-1',
        ...createMessageDto,
        timestamp: new Date(),
        metadata: {},
      };

      jest.spyOn(messageRepository, 'create').mockResolvedValue(createdMessage);

      const result = await service.createMessage(createMessageDto);

      expect(messageRepository.create).toHaveBeenCalledWith(createMessageDto);
      expect(kafkaProducerService.publishMessage).toHaveBeenCalledWith(
        createdMessage,
      );
      expect(redisService.deleteKeysByPattern).toHaveBeenCalledWith(
        'conversation:conv-1:*',
      );
      expect(result).toEqual(createdMessage);
    });

    it('should throw an error if message creation fails', async () => {
      const createMessageDto: CreateMessageDto = {
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
      };

      jest
        .spyOn(messageRepository, 'create')
        .mockRejectedValue(new Error('create failed'));

      await expect(service.createMessage(createMessageDto)).rejects.toThrow(
        'create failed',
      );
      expect(kafkaProducerService.publishMessage).not.toHaveBeenCalled();
    });
  });

  describe('getMessagesByConversationId', () => {
    const conversationId = 'conv-1';
    const queryDto: QueryMessagesDto = {
      page: 1,
      limit: 10,
    };

    const mockMessages: { messages: Message[]; total: number } = {
      messages: [
        {
          id: 'msg-1',
          conversationId,
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: new Date(),
          metadata: {},
        },
      ],
      total: 1,
    };

    it('should return cached data if available', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(mockMessages);

      const result = await service.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

      expect(redisService.get).toHaveBeenCalled();
      expect(messageRepository.findByConversationId).not.toHaveBeenCalled();
      expect(result).toEqual(mockMessages);
    });

    it('should query repository and cache results if no cache available', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(messageRepository, 'findByConversationId')
        .mockResolvedValue(mockMessages);

      const result = await service.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

      expect(redisService.get).toHaveBeenCalled();
      expect(messageRepository.findByConversationId).toHaveBeenCalledWith(
        conversationId,
        queryDto,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        mockMessages,
      );
      expect(result).toEqual(mockMessages);
    });

    it('should throw an error if repository query fails', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(messageRepository, 'findByConversationId')
        .mockRejectedValue(new Error('query failed'));

      await expect(
        service.getMessagesByConversationId(conversationId, queryDto),
      ).rejects.toThrow('query failed');
    });
  });

  describe('searchMessages', () => {
    const conversationId = 'conv-1';
    const searchDto: SearchMessagesDto = {
      q: 'hello',
    };

    const mockSearchResults = {
      messages: [
        {
          conversationId,
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: new Date(),
          score: 0.8,
        },
      ],
      total: 1,
    };

    it('should return cached search results if available', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(redisService.get).toHaveBeenCalled();
      expect(elasticsearchService.searchMessages).not.toHaveBeenCalled();
      expect(result).toEqual(mockSearchResults);
    });

    it('should perform search and cache results if no cache available', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(elasticsearchService, 'searchMessages')
        .mockResolvedValue(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(redisService.get).toHaveBeenCalled();
      expect(elasticsearchService.searchMessages).toHaveBeenCalledWith(
        conversationId,
        searchDto,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        mockSearchResults,
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should throw an error if search fails', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(elasticsearchService, 'searchMessages')
        .mockRejectedValue(new Error('search failed'));

      await expect(
        service.searchMessages(conversationId, searchDto),
      ).rejects.toThrow('search failed');
    });
  });
});
