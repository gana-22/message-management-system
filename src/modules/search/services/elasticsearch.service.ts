/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { Message } from '../../messages/interfaces/message.interface';
import { SearchMessagesDto } from '../../messages/dto/search-messages.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private readonly index: string;
  private readonly shards: number;
  private readonly replicas: number;
  private readonly logger = new Logger(ElasticsearchService.name);

  constructor(private configService: ConfigService) {
    this.client = new Client({
      node: this.configService.get<string>('elasticsearch.node'),
    });
    this.index = this.configService.get<string>('elasticsearch.index') || '';
    this.shards = this.configService.get<number>('elasticsearch.shards') || 1;
    this.replicas =
      this.configService.get<number>('elasticsearch.replicas') || 0;
  }

  // initialize Elasticsearch
  async onModuleInit() {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.index,
      });

      // create index if not exists
      if (!indexExists) {
        await this.client.indices.create({
          index: this.index,
          mappings: {
            properties: {
              conversationId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              content: {
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: {
                    type: 'keyword',
                    ignore_above: 256,
                  },
                },
              },
              timestamp: { type: 'date' },
              metadata: { type: 'object', enabled: true },
            },
          },
          settings: {
            number_of_shards: this.shards,
            number_of_replicas: this.replicas,
          },
        });
        this.logger.log(`Created Elasticsearch index: ${this.index}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize Elasticsearch: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // disconnect Elasticsearch upon receiving termination signal
  async onModuleDestroy() {
    try {
      await this.client.close();
      this.logger.log('Elasticsearch client disconnected successfully');
    } catch (error) {
      this.logger.error(
        `Failed to disconnect Elasticsearch client: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // index message to Elasticsearch
  async indexMessage(message: Message) {
    try {
      const documentToIndex = { ...message };

      let id: string = uuidv4();
      if ('_id' in documentToIndex) {
        id = documentToIndex._id as string;
        delete documentToIndex._id;
      }

      if ('__v' in documentToIndex) {
        delete documentToIndex.__v;
      }

      const result = this.client.index({
        index: this.index,
        id,
        document: documentToIndex,
        refresh: true,
      });
      this.logger.log(`Indexed message ${id} to Elasticsearch`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to index message to Elasticsearch: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // search message from Elasticsearch
  async searchMessages(conversationId: string, searchDto: SearchMessagesDto) {
    try {
      const { q, page = 1, limit = 10 } = searchDto;
      const from = (page - 1) * limit;

      this.logger.log(`Searching for "${q}" in conversation ${conversationId}`);

      const result = await this.client.search<Message>({
        index: this.index,
        query: {
          bool: {
            must: [
              { match: { conversationId } },
              {
                multi_match: {
                  query: q,
                  fields: ['content^3', 'metadata.*'],
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        from,
        size: limit,
        sort: [{ timestamp: { order: 'desc' } }],
      });

      const hits = result?.hits?.hits || [];
      const total =
        typeof result.hits.total === 'number'
          ? result.hits.total
          : result.hits.total?.value || 0;

      this.logger.log(`Found ${total} results for query "${q}"`);

      return {
        messages: hits.map((hit) => ({
          ...hit._source,
          score: hit._score,
        })),
        total,
      };
    } catch (error) {
      this.logger.error(
        `Searching on Elasticsearch error: ${error?.message || error}`,
      );
      return { messages: [], total: 0 };
    }
  }

  // deleting conversation in Elasticsearch
  async deleteByConversationId(conversationId: string): Promise<any> {
    try {
      const result = await this.client.deleteByQuery({
        index: this.index,
        body: {
          query: {
            match: {
              conversationId: conversationId,
            },
          },
        },
        refresh: true,
      });

      this.logger.log(
        `Deleted ${result.deleted} messages for conversation ID: ${conversationId} from Elasticsearch`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to delete messages by conversation ID from Elasticsearch: ${
          error?.message || error
        }`,
      );
      throw error;
    }
  }
}
