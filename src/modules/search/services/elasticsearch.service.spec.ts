import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from './elasticsearch.service';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('abc'),
}));

interface ElasticIndexOptions {
  index: string;
  mappings?: {
    properties: Record<string, unknown>;
  };
  settings?: {
    number_of_shards: number;
    number_of_replicas: number;
  };
}

interface ElasticDocumentOptions {
  index: string;
  id: string;
  document: Record<string, unknown>;
  refresh: boolean;
}

interface ElasticSearchOptions {
  index: string;
  from: number;
  size: number;
  query: {
    bool: {
      must: unknown[];
    };
  };
}

interface ElasticSearchResult {
  hits: {
    hits: Array<{
      _source: Record<string, unknown>;
      _score: number | null;
    }>;
    total: {
      value: number;
    };
  };
}

const mockElasticClient = {
  indices: {
    exists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(undefined) as jest.Mock<
      unknown,
      [ElasticIndexOptions]
    >,
  },
  index: jest.fn().mockResolvedValue(undefined) as jest.Mock<
    unknown,
    [ElasticDocumentOptions]
  >,
  search: jest.fn().mockResolvedValue({
    hits: {
      hits: [],
      total: { value: 0 },
    },
  }) as jest.Mock<Promise<ElasticSearchResult>, [ElasticSearchOptions]>,
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => mockElasticClient),
}));

describe('Elasticsearch Service', () => {
  let service: ElasticsearchService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElasticsearchService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'elasticsearch.node') return 'http://localhost:9200';
              if (key === 'elasticsearch.index') return 'messages';
              if (key === 'elasticsearch.shards') return 1;
              if (key === 'elasticsearch.replicas') return 0;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ElasticsearchService>(ElasticsearchService);
  });

  describe('onModuleInit', () => {
    it('should check if index exists and create it if needed', async () => {
      mockElasticClient.indices.exists.mockResolvedValueOnce(false);

      await service.onModuleInit();

      expect(mockElasticClient.indices.exists).toHaveBeenCalledWith({
        index: 'messages',
      });

      expect(mockElasticClient.indices.create).toHaveBeenCalled();

      const createCall = mockElasticClient.indices.create.mock.calls[0][0];
      expect(createCall.index).toBe('messages');
      expect(createCall.mappings).toBeDefined();

      const contentType = createCall.mappings?.properties.content as {
        type: string;
      };
      expect(contentType.type).toBe('text');
      expect(createCall.settings?.number_of_shards).toBe(1);
      expect(createCall.settings?.number_of_replicas).toBe(0);
    });

    it('should not create index if it already exists', async () => {
      mockElasticClient.indices.exists.mockResolvedValueOnce(true);

      await service.onModuleInit();

      expect(mockElasticClient.indices.exists).toHaveBeenCalledWith({
        index: 'messages',
      });
      expect(mockElasticClient.indices.create).not.toHaveBeenCalled();
    });

    it('should throw error if connect fails', async () => {
      mockElasticClient.indices.exists.mockRejectedValueOnce(
        new Error('initialize failed'),
      );
      await expect(service.onModuleInit()).rejects.toThrow('initialize failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Elasticsearch on module destroy', async () => {
      await service.onModuleDestroy();
      expect(mockElasticClient.close).toHaveBeenCalled();
    });

    it('should throw error if disconnect fails', async () => {
      mockElasticClient.close.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );
      await expect(service.onModuleDestroy()).rejects.toThrow(
        'disconnect failed',
      );
    });
  });

  describe('indexMessage', () => {
    it('should index a message with _id property', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
        _id: 'msg-1',
      };

      await service.indexMessage(message);

      expect(mockElasticClient.index).toHaveBeenCalledWith({
        index: 'messages',
        id: 'msg-1',
        document: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: message.timestamp,
        },
        refresh: true,
      });
    });

    it('should index a message with __v property', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
        __v: 0,
      };

      await service.indexMessage(message);

      expect(mockElasticClient.index).toHaveBeenCalledWith({
        index: 'messages',
        id: 'abc',
        document: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: message.timestamp,
        },
        refresh: true,
      });
    });

    it('should index a message with both _id and __v properties', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
        _id: 'msg-1',
        __v: 0,
      };

      await service.indexMessage(message);

      expect(mockElasticClient.index).toHaveBeenCalledWith({
        index: 'messages',
        id: 'msg-1',
        document: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: message.timestamp,
        },
        refresh: true,
      });
    });

    it('should index a message without _id and __v properties', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      await service.indexMessage(message);

      expect(mockElasticClient.index).toHaveBeenCalledWith({
        index: 'messages',
        id: 'abc',
        document: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello world',
          timestamp: message.timestamp,
        },
        refresh: true,
      });
    });

    it('should log and throw error if indexing fails', async () => {
      const message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        timestamp: new Date(),
      };

      const error = new Error('indexing failed') as unknown as never;
      mockElasticClient.index.mockRejectedValueOnce(error);

      await expect(service.indexMessage(message)).rejects.toThrow(
        'indexing failed',
      );
      expect(mockElasticClient.index).toHaveBeenCalled();
    });
  });

  describe('searchMessages', () => {
    it('should search messages using Elasticsearch', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'hello', page: 1, limit: 10 };

      const mockSearchResults: ElasticSearchResult = {
        hits: {
          hits: [
            {
              _source: {
                id: 'msg-1',
                conversationId: 'conv-1',
                senderId: 'user-1',
                content: 'Hello world',
                timestamp: '2025-04-06T15:44:45.182Z',
                createdAt: '2025-04-06T15:44:45.183Z',
                updatedAt: '2025-04-06T15:44:45.183Z',
              },
              _score: null,
            },
          ],
          total: { value: 1 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();

      const searchCall = mockElasticClient.search.mock.calls[0][0];
      expect(searchCall.index).toBe('messages');
      expect(searchCall.from).toBe(0);
      expect(searchCall.size).toBe(10);
      expect(searchCall.query.bool.must).toBeDefined();

      expect(result.messages.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.messages[0]).toHaveProperty('content', 'Hello world');
      expect(result.messages[0]).toHaveProperty('score', null);
    });

    it('should handle empty search results', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'nonexistent', page: 1, limit: 10 };

      const emptyResults: ElasticSearchResult = {
        hits: {
          hits: [],
          total: { value: 0 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(emptyResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();
      expect(result.messages).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle multiple search results', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'hello', page: 1, limit: 10 };

      const mockSearchResults: ElasticSearchResult = {
        hits: {
          hits: [
            {
              _source: {
                id: 'msg-1',
                conversationId: 'conv-1',
                senderId: 'user-1',
                content: 'Hello world',
                timestamp: '2025-04-06T15:44:45.182Z',
                createdAt: '2025-04-06T15:44:45.183Z',
                updatedAt: '2025-04-06T15:44:45.183Z',
              },
              _score: null,
            },
            {
              _source: {
                id: 'msg-2',
                conversationId: 'conv-1',
                senderId: 'user-2',
                content: 'Hello earth2',
                timestamp: '2025-04-06T15:45:45.182Z',
                createdAt: '2025-04-06T15:45:45.183Z',
                updatedAt: '2025-04-06T15:45:45.183Z',
              },
              _score: null,
            },
          ],
          total: { value: 2 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();
      expect(result.messages.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.messages[0]).toHaveProperty('content', 'Hello world');
      expect(result.messages[1]).toHaveProperty('content', 'Hello earth2');
    });

    it('should handle pagination correctly', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'hello', page: 2, limit: 10 };

      const mockSearchResults: ElasticSearchResult = {
        hits: {
          hits: [
            {
              _source: {
                id: 'msg-11',
                conversationId: 'conv-1',
                senderId: 'user-1',
                content: 'Hello earth2',
                timestamp: '2025-04-06T15:46:45.182Z',
                createdAt: '2025-04-06T15:46:45.183Z',
                updatedAt: '2025-04-06T15:46:45.183Z',
              },
              _score: null,
            },
          ],
          total: { value: 11 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();
      expect(result.messages.length).toBe(1);
      expect(result.total).toBe(11);
      expect(result.messages[0]).toHaveProperty('content', 'Hello earth2');
    });

    it('should handle different query parameters', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'world', page: 1, limit: 5 };

      const mockSearchResults: ElasticSearchResult = {
        hits: {
          hits: [
            {
              _source: {
                id: 'msg-1',
                conversationId: 'conv-1',
                senderId: 'user-1',
                content: 'Hello world',
                timestamp: '2025-04-06T15:44:45.182Z',
                createdAt: '2025-04-06T15:44:45.183Z',
                updatedAt: '2025-04-06T15:44:45.183Z',
              },
              _score: null,
            },
          ],
          total: { value: 1 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();
      expect(result.messages.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.messages[0]).toHaveProperty('content', 'Hello world');
    });

    it('should handle fuzziness query parameters', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'helo', page: 1, limit: 5 };

      const mockSearchResults: ElasticSearchResult = {
        hits: {
          hits: [
            {
              _source: {
                id: 'msg-1',
                conversationId: 'conv-1',
                senderId: 'user-1',
                content: 'Hello world',
                timestamp: '2025-04-06T15:44:45.182Z',
                createdAt: '2025-04-06T15:44:45.183Z',
                updatedAt: '2025-04-06T15:44:45.183Z',
              },
              _score: null,
            },
          ],
          total: { value: 1 },
        },
      };

      mockElasticClient.search.mockResolvedValueOnce(mockSearchResults);

      const result = await service.searchMessages(conversationId, searchDto);

      expect(mockElasticClient.search).toHaveBeenCalled();
      expect(result.messages.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.messages[0]).toHaveProperty('content', 'Hello world');
    });

    it('should log and throw error if search fails', async () => {
      const conversationId = 'conv-1';
      const searchDto = { q: 'hello', page: 1, limit: 10 };

      mockElasticClient.search.mockResolvedValueOnce({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      const result = await service.searchMessages(conversationId, searchDto);
      expect(result).toEqual({ messages: [], total: 0 });
      expect(mockElasticClient.search).toHaveBeenCalled();
    });
  });
});
