import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { MessagesService } from '../services/messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { SearchMessagesDto } from '../dto/search-messages.dto';

describe('Message Controller', () => {
  let controller: MessagesController;
  let messagesService: MessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: {
            createMessage: jest.fn(),
            getMessagesByConversationId: jest.fn(),
            searchMessages: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
    messagesService = module.get<MessagesService>(MessagesService);
  });

  describe('createMessage', () => {
    it('should create a new message', async () => {
      const createMessageDto: CreateMessageDto = {
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
      };

      const createdMessage = {
        id: 'msg-1',
        ...createMessageDto,
        timestamp: new Date(),
      };

      jest
        .spyOn(messagesService, 'createMessage')
        .mockResolvedValue(createdMessage);

      const result = await controller.createMessage(createMessageDto);

      expect(messagesService.createMessage).toHaveBeenCalledWith(
        createMessageDto,
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
        .spyOn(messagesService, 'createMessage')
        .mockRejectedValue(new Error('create failed'));

      await expect(
        controller.createMessage(createMessageDto),
      ).rejects.toThrow();
    });
  });

  describe('getMessagesByConversationId', () => {
    it('should get messages by conversation ID', async () => {
      const conversationId = 'conv-1';
      const queryDto: QueryMessagesDto = {
        page: 1,
        limit: 10,
      };

      const mockResult = {
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

      jest
        .spyOn(messagesService, 'getMessagesByConversationId')
        .mockResolvedValue(mockResult);

      const result = await controller.getMessagesByConversationId(
        conversationId,
        queryDto,
      );

      expect(messagesService.getMessagesByConversationId).toHaveBeenCalledWith(
        conversationId,
        queryDto,
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw an error if getting messages fails', async () => {
      const conversationId = 'conv-1';
      const queryDto: QueryMessagesDto = {
        page: 1,
        limit: 10,
      };

      jest
        .spyOn(messagesService, 'getMessagesByConversationId')
        .mockRejectedValue(new Error('query failed'));

      await expect(
        controller.getMessagesByConversationId(conversationId, queryDto),
      ).rejects.toThrow();
    });
  });

  describe('searchMessages', () => {
    it('should search messages by query', async () => {
      const conversationId = 'conv-1';
      const searchDto: SearchMessagesDto = {
        q: 'hello',
      };

      const mockResult = {
        messages: [
          {
            conversationId,
            senderId: 'user-1',
            content: 'Hello world',
            timestamp: new Date(),
            score: null,
          },
        ],
        total: 1,
      };

      jest
        .spyOn(messagesService, 'searchMessages')
        .mockResolvedValue(mockResult);

      const result = await controller.searchMessages(conversationId, searchDto);

      expect(messagesService.searchMessages).toHaveBeenCalledWith(
        conversationId,
        searchDto,
      );
      expect(result).toEqual(mockResult);
    });

    it('should search messages by query even when the query is fuzziness', async () => {
      const conversationId = 'conv-1';
      const searchDto: SearchMessagesDto = {
        q: 'helo',
      };

      const mockResult = {
        messages: [
          {
            conversationId,
            senderId: 'user-1',
            content: 'Hello world',
            timestamp: new Date(),
            score: null,
          },
        ],
        total: 1,
      };

      jest
        .spyOn(messagesService, 'searchMessages')
        .mockResolvedValue(mockResult);

      const result = await controller.searchMessages(conversationId, searchDto);

      expect(messagesService.searchMessages).toHaveBeenCalledWith(
        conversationId,
        searchDto,
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw an error if search fails', async () => {
      const conversationId = 'conv-1';
      const searchDto: SearchMessagesDto = {
        q: 'hello',
      };

      jest
        .spyOn(messagesService, 'searchMessages')
        .mockRejectedValue(new Error('search failed'));

      await expect(
        controller.searchMessages(conversationId, searchDto),
      ).rejects.toThrow();
    });
  });
});
