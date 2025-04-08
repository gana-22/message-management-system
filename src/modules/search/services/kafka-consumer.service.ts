/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { ElasticsearchService } from './elasticsearch.service';
import { Message } from '../../messages/interfaces/message.interface';
import { KafkaConsumerConfig } from '../../messages/interfaces/kafka.interface';
import { CacheMessage } from '../../messages/interfaces/cache.interface';
import { retryMechanism } from '../../../helpers/common/service';
import { RedisService } from '../../../helpers/redis/redis.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumers: Map<string, Consumer> = new Map();
  private readonly messageTopic: string;
  private readonly cacheTopic: string;
  private readonly kafka: Kafka;
  private readonly brokers: string[];
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly maxRetries = 10;
  private readonly retryDelay = 3000;

  constructor(
    private configService: ConfigService,
    private elasticsearchService: ElasticsearchService,
    private redisService: RedisService,
  ) {
    this.brokers = this.configService.get<string[]>('kafka.brokers') || [];
    this.kafka = new Kafka({
      clientId: 'message-api-consumer',
      brokers: this.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
        factor: 1.5,
      },
    });

    this.messageTopic =
      this.configService.get<string>('kafka.messageTopic') || '';
    this.cacheTopic = this.configService.get<string>('kafka.cacheTopic') || '';
  }

  // configure and start each consumer
  async onModuleInit() {
    await Promise.all([
      this.setupConsumer<Message>({
        topic: this.messageTopic,
        groupId: 'message-indexer',
        fromBeginning: false,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
        processor: async (message: Message) => {
          await this.elasticsearchService.indexMessage(message);
        },
      }),

      this.setupConsumer<CacheMessage>({
        topic: this.cacheTopic,
        groupId: 'cache-indexer',
        fromBeginning: false,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
        processor: async (cache: CacheMessage) => {
          const { key, value } = cache;
          await this.redisService.set(key, value);
        },
      }),
    ]);
  }

  // setting up kafka consumer
  private async setupConsumer<T>(
    config: KafkaConsumerConfig<T>,
    isRetry = false,
  ): Promise<void> {
    try {
      const consumer = this.kafka.consumer({ groupId: config.groupId });
      this.consumers.set(config.topic, consumer);

      await consumer.connect();

      await consumer.subscribe({
        topic: config.topic,
        fromBeginning: config.fromBeginning ?? false,
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) {
            this.logger.warn(
              `Received message with null value on topic ${config.topic}, skipping`,
            );
            return;
          }

          try {
            const messageValue = message.value.toString();
            const parsedMessage = JSON.parse(messageValue) as T;

            await retryMechanism(
              async () => {
                await config.processor(parsedMessage);
              },
              config.maxRetries,
              config.retryDelay,
            );

            this.logger.log(
              `Successfully processed message on topic ${config.topic}`,
            );
          } catch (error) {
            this.logger.error(
              `Error processing message on topic ${config.topic}: ${error?.message || error}`,
            );
            throw error; // to prevent the offset commit
          }
        },
        autoCommit: false, // disable auto-commit
      });

      this.logger.log(
        `Kafka consumer connected and subscribed to topic ${config.topic}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Kafka consumer for topic ${config.topic}: ${error?.message || error}`,
      );

      if (!isRetry) {
        await retryMechanism(
          () => this.setupConsumer(config, true),
          config.maxRetries,
          config.retryDelay,
        );
      } else {
        throw error;
      }
    }
  }

  // disconnect upon termination signal
  async onModuleDestroy() {
    if (this.consumers.size === 0) {
      this.logger.log('No Kafka consumers to disconnect');
      return;
    }

    this.logger.log(`Disconnecting ${this.consumers.size} Kafka consumers...`);

    for (const [topic, consumer] of this.consumers.entries()) {
      try {
        await consumer.disconnect();
        this.logger.log(`Disconnected Kafka consumer for topic ${topic}`);
      } catch (error) {
        this.logger.error(
          `Failed to disconnect Kafka consumer for topic ${topic}: ${error?.message || error}`,
        );
        // continue disconnecting other consumers even if one fails
      }
    }

    this.logger.log('All Kafka consumers disconnected');
  }
}
