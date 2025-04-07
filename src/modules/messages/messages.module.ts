import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from './schemas/message.schema';
import { MessagesController } from './controllers/messages.controller';
import { MessagesService } from './services/messages.service';
import { MessageRepository } from './repositories/message.repository';
import { KafkaProducerService } from './services/kafka-producer.service';
import { SearchModule } from '../search/search.module';
import { RedisService } from '../../helpers/redis/redis.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    SearchModule,
  ],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessageRepository,
    KafkaProducerService,
    RedisService,
  ],
})
export class MessagesModule {}
