import { Module } from '@nestjs/common';
import { ElasticsearchService } from './services/elasticsearch.service';
import { KafkaConsumerService } from './services/kafka-consumer.service';

@Module({
  providers: [ElasticsearchService, KafkaConsumerService],
  exports: [ElasticsearchService],
})
export class SearchModule {}
