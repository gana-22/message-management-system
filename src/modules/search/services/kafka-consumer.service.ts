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
import { retryMechanism } from '../../../helpers/common/service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;
  private readonly topic: string;
  private readonly kafka: Kafka;
  private readonly brokers: string[];
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly maxRetries = 10;
  private readonly retryDelay = 3000;

  constructor(
    private configService: ConfigService,
    private elasticsearchService: ElasticsearchService,
  ) {
    this.brokers = this.configService.get<string[]>('kafka.brokers') || [];
    this.kafka = new Kafka({
      clientId: 'message-api-consumer',
      brokers: this.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });

    this.consumer = this.kafka.consumer({ groupId: 'message-indexer' });
    this.topic = this.configService.get<string>('kafka.topic') || '';
  }

  // initialize kafka consumer
  async onModuleInit() {
    await this.setupConsumer();
  }

  // setting up kafka consumer
  private async setupConsumer(isRetry = false) {
    try {
      await this.consumer.connect();

      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();

      // Create topic if not found
      if (!topics.includes(this.topic)) {
        if (isRetry) {
          this.logger.log(`Topic ${this.topic} not found`);
          await admin.disconnect();
          await retryMechanism(
            () => this.setupConsumer(true),
            this.maxRetries,
            this.retryDelay,
          );
          return;
        } else {
          try {
            await admin.createTopics({
              topics: [
                {
                  topic: this.topic,
                  numPartitions: 3,
                  replicationFactor: 1,
                },
              ],
            });
            this.logger.log(`Created Kafka topic: ${this.topic}`);
          } catch (error) {
            // Continue as the default topic has been created
            this.logger.warn(
              `Failed to create topic: ${error?.message || error}`,
            );
          }
        }
      }

      await admin.disconnect();

      await this.consumer.subscribe({
        topic: this.topic,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) {
            this.logger.warn('Received message with null value, skipping');
            return;
          }

          try {
            const messageValue = message.value.toString();
            const parsedMessage = JSON.parse(messageValue) as Message;

            await this.elasticsearchService.indexMessage(parsedMessage);
          } catch (error) {
            this.logger.error(
              `Error processing message: ${error?.message || error}`,
            );
          }
        },
      });

      this.logger.log(
        `Kafka consumer connected and subscribed to topic ${this.topic}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Kafka consumer: ${error?.message || error}`,
      );
      if (!isRetry) {
        await retryMechanism(
          () => this.setupConsumer(true),
          this.maxRetries,
          this.retryDelay,
        );
      } else {
        throw error;
      }
    }
  }

  // disconnect kafka consumer upon receiving termination signal
  async onModuleDestroy() {
    try {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected successfully');
    } catch (error) {
      this.logger.error(
        `Failed to disconnect kafka consumer: ${error?.message || error}`,
      );
      throw error;
    }
  }
}
