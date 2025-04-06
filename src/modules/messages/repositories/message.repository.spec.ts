import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { MessageRepository } from './message.repository';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { Model } from 'mongoose';

describe('Message Repository', () => {
  let repository: MessageRepository;

  const mockExec = jest.fn();
  const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
  const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
  const mockFind = jest.fn().mockReturnValue({ sort: mockSort });
  const mockCountExec = jest.fn();
  const mockCountDocuments = jest.fn().mockReturnValue({ exec: mockCountExec });
  const mockFindByIdExec = jest.fn();
  const mockFindById = jest.fn().mockReturnValue({ exec: mockFindByIdExec });
  const mockSave = jest.fn();

  const mockMessageModel = function () {
    return {
      save: mockSave,
    };
  } as unknown as Model<MessageDocument>;

  mockMessageModel.find = mockFind;
  mockMessageModel.findById = mockFindById;
  mockMessageModel.countDocuments = mockCountDocuments;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRepository,
        {
          provide: getModelToken(Message.name),
          useValue: mockMessageModel,
        },
      ],
    }).compile();

    repository = module.get<MessageRepository>(MessageRepository);
  });

  describe('create', () => {
    it('should create and save a new message', async () => {
      const createMessageDto: CreateMessageDto = {
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
      };

      const savedMessage = {
        ...createMessageDto,
        _id: 'msg-1',
        timestamp: new Date(),
      };

      mockSave.mockResolvedValueOnce(savedMessage);

      const result = await repository.create(createMessageDto);

      expect(mockSave).toHaveBeenCalled();
      expect(result).toMatchObject({
        _id: 'msg-1',
        ...createMessageDto,
      });
    });
  });

  describe('findByConversationId', () => {
    const conversationId = 'conv-1';
    const queryDto: QueryMessagesDto = {
      page: 2,
      limit: 5,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };

    const mockMessages = [
      {
        _id: 'msg-1',
        conversationId,
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      },
    ];

    it('should find messages by conversation ID with query params', async () => {
      mockExec.mockResolvedValueOnce(mockMessages);
      mockCountExec.mockResolvedValueOnce(10);

      const result = await repository.findByConversationId(
        conversationId,
        queryDto,
      );

      expect(mockFind).toHaveBeenCalledWith({ conversationId });
      expect(mockSort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(mockSkip).toHaveBeenCalledWith(5);
      expect(mockLimit).toHaveBeenCalledWith(5);
      expect(mockExec).toHaveBeenCalled();
      expect(mockCountDocuments).toHaveBeenCalledWith({
        conversationId,
      });

      expect(result).toEqual({
        messages: mockMessages,
        total: 10,
      });
    });

    it('should use default query param values if not provided', async () => {
      const defaultQueryDto: QueryMessagesDto = {};

      mockExec.mockResolvedValueOnce(mockMessages);
      mockCountExec.mockResolvedValueOnce(10);

      await repository.findByConversationId(conversationId, defaultQueryDto);

      expect(mockFind).toHaveBeenCalledWith({ conversationId });
      expect(mockSort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(mockSkip).toHaveBeenCalledWith(0);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should use ascending sort if specified', async () => {
      const ascSortQueryDto: QueryMessagesDto = {
        sortBy: 'timestamp',
        sortOrder: 'asc',
      };

      mockExec.mockResolvedValueOnce(mockMessages);
      mockCountExec.mockResolvedValueOnce(10);

      await repository.findByConversationId(conversationId, ascSortQueryDto);

      expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 });
    });
  });

  describe('findById', () => {
    it('should find a message by ID', async () => {
      const mockMessage = {
        _id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      mockFindByIdExec.mockResolvedValueOnce(mockMessage);

      const result = await repository.findById('msg-1');

      expect(mockFindById).toHaveBeenCalledWith('msg-1');
      expect(result).toEqual(mockMessage);
    });

    it('should return null if message not found', async () => {
      mockFindByIdExec.mockResolvedValueOnce(null);

      const result = await repository.findById('non-existent-id');

      expect(mockFindById).toHaveBeenCalledWith('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
