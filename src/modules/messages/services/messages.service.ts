/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { MessageRepository } from '../repositories/message.repository';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { SearchMessagesDto } from '../dto/search-messages.dto';
import { KafkaProducerService } from './kafka-producer.service';
import { ElasticsearchService } from '../../search/services/elasticsearch.service';
import { Message } from '../interfaces/message.interface';
import { RedisService } from '../../../helpers/redis/redis.service';
import { createKey } from '../../../helpers/common/service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private messageRepository: MessageRepository,
    private kafkaProducerService: KafkaProducerService,
    private elasticsearchService: ElasticsearchService,
    private readonly redisService: RedisService,
  ) {}

  // creates a new message
  async createMessage(createMessageDto: CreateMessageDto): Promise<Message> {
    try {
      const message = (await this.messageRepository.create(
        createMessageDto,
      )) as Message;

      const cacheKey = createKey('conversation', message.conversationId, '*');
      await Promise.allSettled([
        this.kafkaProducerService.publishMessage(message).catch((error) => {
          this.logger.error(
            `Failed to publish message to Kafka: ${error?.message || error}`,
          );
        }),
        this.redisService.deleteKeysByPattern(cacheKey).catch((error) => {
          this.logger.error(
            `Failed to delete cache: ${error?.message || error}`,
          );
        }),
      ]);

      this.logger.log(`Message published to Kafka for processing`);
      this.logger.log(`Conversation cache deleted`);

      return message;
    } catch (error) {
      this.logger.error(`Failed to create message: ${error?.message || error}`);
      throw error;
    }
  }

  // retrieve messages for a conversation
  async getMessagesByConversationId(
    conversationId: string,
    queryDto: QueryMessagesDto,
  ) {
    const cacheKey = createKey('conversation', conversationId, queryDto);

    // try to get the cache
    try {
      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        this.logger.log(
          `Returning cached results for conversation: "${conversationId}"`,
        );
        return cachedData;
      }
    } catch (redisGetError) {
      this.logger.warn(
        `Redis cache retrieval failed: ${redisGetError?.message || redisGetError}`,
      );
    }

    try {
      this.logger.log(`No cache, find conversation by id: "${conversationId}"`);
      const result = await this.messageRepository.findByConversationId(
        conversationId,
        queryDto,
      );

      // try to cache result
      try {
        await this.redisService.set(cacheKey, result);
      } catch (redisSetError) {
        this.logger.warn(
          `Failed to cache results: ${redisSetError?.message || redisSetError}`,
        );

        // try to publish the cache result with key to Kafka as fallback in case if set cache failed
        try {
          await this.kafkaProducerService.publishCache(cacheKey, result);
        } catch (kafkaError) {
          this.logger.error(
            `Failed to publish to Kafka: ${kafkaError?.message || kafkaError}`,
          );
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve message: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // searching messages
  async searchMessages(conversationId: string, searchDto: SearchMessagesDto) {
    try {
      const cacheKey = createKey('conversation', conversationId, searchDto);

      try {
        const cachedData = await this.redisService.get(cacheKey);
        if (cachedData) {
          this.logger.log(
            `Returning cached search results for query "${searchDto.q}"`,
          );
          return cachedData;
        }
      } catch (redisGetError) {
        this.logger.warn(
          `Redis cache retrieval failed: ${redisGetError?.message || redisGetError}`,
        );
      }

      this.logger.log(`No cache, search message for: "${searchDto.q}"`);
      const result = await this.elasticsearchService.searchMessages(
        conversationId,
        searchDto,
      );

      try {
        await this.redisService.set(cacheKey, result);
      } catch (redisSetError) {
        this.logger.warn(
          `Failed to cache search results: ${redisSetError?.message || redisSetError}`,
        );

        // try to publish the cache result with key to Kafka as fallback in case if set cache failed
        try {
          await this.kafkaProducerService.publishCache(cacheKey, result);
        } catch (kafkaError) {
          this.logger.error(
            `Failed to publish to Kafka: ${kafkaError?.message || kafkaError}`,
          );
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to search message: ${error?.message || error}`);
      throw error;
    }
  }

  // deleting conversation
  async deleteConversation(conversationId: string) {
    try {
      const cacheKey = createKey('conversation', conversationId, '*');

      const results = await Promise.allSettled([
        this.redisService.deleteKeysByPattern(cacheKey),
        this.messageRepository.deleteMessagesByConversationId(conversationId),
        this.elasticsearchService.deleteByConversationId(conversationId),
      ]);

      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        const errors = failures.map(
          (result: any) => result.reason?.message || 'Unknown error',
        );
        this.logger.error(
          `Some delete operations failed: ${errors.join(', ')}`,
        );
        throw new Error(`Failed to delete conversation: ${errors[0]}`);
      }

      return { message: 'all deleted' };
    } catch (error) {
      this.logger.error(
        `Failed to delete conversation: ${error?.message || error}`,
      );
      throw error;
    }
  }
}
