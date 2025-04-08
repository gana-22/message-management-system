import { Test, TestingModule } from '@nestjs/testing';
import { MessagesService } from './messages.service';
import { MessageRepository } from '../repositories/message.repository';
import { KafkaProducerService } from './kafka-producer.service';
import { ElasticsearchService } from '../../search/services/elasticsearch.service';
import { RedisService } from '../../../helpers/redis/redis.service';
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
            deleteMessagesByConversationId: jest.fn(),
          },
        },
        {
          provide: KafkaProducerService,
          useValue: {
            // Return a Promise with a catch method instead of using mockResolvedValue
            publishMessage: jest.fn(() => {
              const promise = Promise.resolve();
              promise.catch = jest.fn().mockReturnValue(promise);
              return promise;
            }),
            publishCache: jest.fn(),
          },
        },
        {
          provide: ElasticsearchService,
          useValue: {
            searchMessages: jest.fn(),
            deleteByConversationId: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            // Return a Promise with a catch method instead of using mockResolvedValue
            deleteKeysByPattern: jest.fn(() => {
              const promise = Promise.resolve();
              promise.catch = jest.fn().mockReturnValue(promise);
              return promise;
            }),
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

    it('should proceed with Kafka publishing even if Redis cache deletion fails', async () => {
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
      jest
        .spyOn(redisService, 'deleteKeysByPattern')
        .mockRejectedValueOnce(new Error('redis deletion failed'));

      const result = await service.createMessage(createMessageDto);

      expect(messageRepository.create).toHaveBeenCalledWith(createMessageDto);
      expect(kafkaProducerService.publishMessage).toHaveBeenCalledWith(
        createdMessage,
      );
      expect(result).toEqual(createdMessage);
    });

    it('should proceed with Redis cache deletion even if Kafka publishing fails', async () => {
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
      jest
        .spyOn(kafkaProducerService, 'publishMessage')
        .mockRejectedValueOnce(new Error('kafka publishing failed'));

      const result = await service.createMessage(createMessageDto);

      expect(messageRepository.create).toHaveBeenCalledWith(createMessageDto);
      expect(redisService.deleteKeysByPattern).toHaveBeenCalledWith(
        'conversation:conv-1:*',
      );
      expect(result).toEqual(createdMessage);
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

    it('should continue with repository query if Redis get fails', async () => {
      jest
        .spyOn(redisService, 'get')
        .mockRejectedValue(new Error('redis get failed'));
      jest
        .spyOn(messageRepository, 'findByConversationId')
        .mockResolvedValue(mockMessages);

      const result = await service.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

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

    it('should fallback to Kafka cache publishing if Redis set fails', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(messageRepository, 'findByConversationId')
        .mockResolvedValue(mockMessages);
      jest
        .spyOn(redisService, 'set')
        .mockRejectedValue(new Error('redis set failed'));

      const result = await service.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

      expect(redisService.get).toHaveBeenCalled();
      expect(messageRepository.findByConversationId).toHaveBeenCalledWith(
        conversationId,
        queryDto,
      );
      expect(kafkaProducerService.publishCache).toHaveBeenCalledWith(
        expect.any(String),
        mockMessages,
      );
      expect(result).toEqual(mockMessages);
    });

    it('should proceed even if both Redis set and Kafka publishCache fail', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(messageRepository, 'findByConversationId')
        .mockResolvedValue(mockMessages);
      jest
        .spyOn(redisService, 'set')
        .mockRejectedValue(new Error('redis set failed'));
      jest
        .spyOn(kafkaProducerService, 'publishCache')
        .mockRejectedValue(new Error('kafka publish failed'));

      const result = await service.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

      expect(messageRepository.findByConversationId).toHaveBeenCalledWith(
        conversationId,
        queryDto,
      );
      expect(result).toEqual(mockMessages);
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

    it('should proceed with search if Redis get fails', async () => {
      jest
        .spyOn(redisService, 'get')
        .mockRejectedValue(new Error('redis get failed'));
      jest
        .spyOn(elasticsearchService, 'searchMessages')
        .mockResolvedValue(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(elasticsearchService.searchMessages).toHaveBeenCalledWith(
        conversationId,
        searchDto,
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should proceed with result even if Redis set fails', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest
        .spyOn(elasticsearchService, 'searchMessages')
        .mockResolvedValue(mockSearchResults);
      jest
        .spyOn(redisService, 'set')
        .mockRejectedValue(new Error('redis set failed'));

      const result = await service.searchMessages(conversationId, searchDto);

      expect(elasticsearchService.searchMessages).toHaveBeenCalledWith(
        conversationId,
        searchDto,
      );
      expect(result).toEqual(mockSearchResults);
    });
  });

  describe('deleteConversation', () => {
    const conversationId = 'conv-1';

    it('should delete cache, messages, and elasticsearch data for a conversation', async () => {
      jest
        .spyOn(redisService, 'deleteKeysByPattern')
        .mockResolvedValue(undefined);
      jest
        .spyOn(messageRepository, 'deleteMessagesByConversationId')
        .mockResolvedValue(1);
      jest
        .spyOn(elasticsearchService, 'deleteByConversationId')
        .mockResolvedValue(undefined);

      const result = await service.deleteConversation(conversationId);

      expect(redisService.deleteKeysByPattern).toHaveBeenCalledWith(
        'conversation:conv-1:*',
      );
      expect(
        messageRepository.deleteMessagesByConversationId,
      ).toHaveBeenCalledWith(conversationId);
      expect(elasticsearchService.deleteByConversationId).toHaveBeenCalledWith(
        conversationId,
      );
      expect(result).toEqual({ message: 'all deleted' });
    });

    it('should throw an error if any deletion process fails', async () => {
      jest
        .spyOn(redisService, 'deleteKeysByPattern')
        .mockRejectedValue(new Error('redis delete failed'));

      await expect(service.deleteConversation(conversationId)).rejects.toThrow(
        'redis delete failed',
      );
    });

    it('should attempt all deletions in parallel', async () => {
      const redisSpy = jest
        .spyOn(redisService, 'deleteKeysByPattern')
        .mockResolvedValue(undefined);
      const repoSpy = jest
        .spyOn(messageRepository, 'deleteMessagesByConversationId')
        .mockResolvedValue(1);
      const esSpy = jest
        .spyOn(elasticsearchService, 'deleteByConversationId')
        .mockResolvedValue(undefined);

      await service.deleteConversation(conversationId);

      // All three methods are called with the same conversation ID
      expect(redisSpy).toHaveBeenCalledWith('conversation:conv-1:*');
      expect(repoSpy).toHaveBeenCalledWith(conversationId);
      expect(esSpy).toHaveBeenCalledWith(conversationId);
    });
  });
});
