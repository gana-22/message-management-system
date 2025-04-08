/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { Message } from '../interfaces/message.interface';
import { KafkaMessage } from '../interfaces/kafka.interface';
import { CacheMessage } from '../../messages/interfaces/cache.interface';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;
  private readonly messageTopic: string;
  private readonly cacheTopic: string;
  private readonly kafka: Kafka;
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly brokers: string[];

  constructor(private configService: ConfigService) {
    this.brokers = this.configService.get<string[]>('kafka.brokers') || [];
    this.kafka = new Kafka({
      clientId: 'message-api',
      brokers: this.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });

    this.producer = this.kafka.producer();
    this.messageTopic =
      this.configService.get<string>('kafka.messageTopic') || '';
    this.cacheTopic = this.configService.get<string>('kafka.cacheTopic') || '';
  }

  // initialize kafka producer
  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log(`Kafka producer connected successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize Kafka producer: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // disconnect kafka producer upon receiving termination signal
  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected successfully');
    } catch (error) {
      this.logger.error(
        `Failed to disconnect kafka producer: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // check if topic exists
  private async ensureTopicExists(topic: string) {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();

      // Create topic if it doesnt exist
      if (!topics.includes(topic)) {
        await admin.createTopics({
          topics: [
            {
              topic,
              numPartitions: 3,
              replicationFactor: 1,
            },
          ],
        });
        this.logger.log(`Created Kafka topic: ${topic}`);
      }

      await admin.disconnect();
    } catch (error) {
      this.logger.error(
        `Failed to connect to kafka: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // generic function to publish message
  async sendMessage<T>(message: KafkaMessage<T>) {
    const topic = message?.topic;
    try {
      await this.ensureTopicExists(topic);

      await this.producer.send({
        topic,
        messages: [
          {
            key: message.key,
            value: JSON.stringify(message.data),
          },
        ],
      });

      this.logger.log(`Message sent to topic: ${topic}, key: ${message?.key}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish message to ${topic}: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // publish message to kafka message topic
  async publishMessage(message: Message): Promise<void> {
    return this.sendMessage({
      topic: this.messageTopic,
      key: message.id,
      data: message,
    });
  }

  // publish cache data to kafka cache topic
  async publishCache<T>(key: string, value: T): Promise<void> {
    const cacheMessage: CacheMessage<T> = {
      key,
      value,
    };

    return this.sendMessage({
      topic: this.cacheTopic,
      key,
      data: cacheMessage,
    });
  }
}
