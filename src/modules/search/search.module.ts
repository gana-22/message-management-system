import { Module } from '@nestjs/common';
import { ElasticsearchService } from './services/elasticsearch.service';
import { KafkaConsumerService } from './services/kafka-consumer.service';
import { RedisService } from '../../helpers/redis/redis.service';

@Module({
  providers: [ElasticsearchService, KafkaConsumerService, RedisService],
  exports: [ElasticsearchService],
})
export class SearchModule {}
