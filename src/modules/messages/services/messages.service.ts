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

      await this.kafkaProducerService.publishMessage(message);
      this.logger.log(`Message published to Kafka for processing`);

      const cacheKey = createKey('conversation', message.conversationId, '*');
      await this.redisService.deleteKeysByPattern(cacheKey);

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
    try {
      const cacheKey = createKey('conversation', conversationId, queryDto);

      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        this.logger.log(
          `Returning cached results for conversation: "${conversationId}"`,
        );
        return cachedData;
      }

      this.logger.log(`No cache, find conversation by id: "${conversationId}"`);
      const result = await this.messageRepository.findByConversationId(
        conversationId,
        queryDto,
      );

      await this.redisService.set(cacheKey, result);

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

      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        this.logger.log(
          `Returning cached search results for query "${searchDto.q}"`,
        );
        return cachedData;
      }

      this.logger.log(`No cache, search message for: "${searchDto.q}"`);
      const result = await this.elasticsearchService.searchMessages(
        conversationId,
        searchDto,
      );

      await this.redisService.set(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to search message: ${error?.message || error}`);
      throw error;
    }
  }
}
