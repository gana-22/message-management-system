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

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;
  private readonly topic: string;
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
    this.topic = this.configService.get<string>('kafka.topic') || '';
  }

  // initialize kafka producer
  async onModuleInit() {
    try {
      await this.producer.connect();
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();

      // Create topic if it doesnt exist
      if (!topics.includes(this.topic)) {
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
      }

      await admin.disconnect();
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

  // publish message to kafka topic
  async publishMessage(message: Message) {
    try {
      await this.producer.send({
        topic: this.topic,
        messages: [
          {
            key: message.id,
            value: JSON.stringify(message),
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish message: ${error?.message || error}`,
      );
      throw error;
    }
  }
}
