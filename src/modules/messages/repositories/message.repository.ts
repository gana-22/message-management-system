/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';

@Injectable()
export class MessageRepository {
  private readonly logger = new Logger(MessageRepository.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // creates a new message
  async create(createMessageDto: CreateMessageDto): Promise<Message> {
    try {
      const createdMessage = new this.messageModel(createMessageDto);
      const result = createdMessage.save();

      this.logger.log(`Successfully saved message in MongoDB`);
      return result;
    } catch (error) {
      this.logger.error('Failed to save message in MongoDB');
      throw error;
    }
  }

  // find message's conversation by conversation id with optional query params
  async findByConversationId(
    conversationId: string,
    queryDto: QueryMessagesDto,
  ): Promise<{ messages: Message[]; total: number }> {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = queryDto;
      const sortOptions: Record<string, 1 | -1> = {};
      const skip = (page - 1) * limit;
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [messages, total] = await Promise.all([
        this.messageModel
          .find({ conversationId })
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.messageModel.countDocuments({ conversationId }).exec(),
      ]);

      this.logger.log(`Found result for conversationid: ${conversationId}`);

      return { messages, total };
    } catch (error) {
      this.logger.error(
        `Failed to find conversation by conversation id: ${error?.message || error}`,
      );
      return { messages: [], total: 0 };
    }
  }

  // find message's conversation by id
  async findById(conversationId: string): Promise<Message | null> {
    try {
      const result = this.messageModel.findById(conversationId).exec();
      this.logger.log(`Found result for id: ${conversationId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to find conversation by id: ${error?.message || error}`,
      );
      throw error;
    }
  }

  // find and delete by conversation id
  async deleteMessagesByConversationId(
    conversationId: string,
  ): Promise<number> {
    try {
      const result = await this.messageModel
        .deleteMany({ conversationId: conversationId })
        .exec();
      this.logger.log(
        `Deleted ${result.deletedCount} messages for conversation ID: ${conversationId} from MongoDB`,
      );
      return result.deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to delete messages by conversation ID from MongoDB: ${
          error?.message || error
        }`,
      );
      throw error;
    }
  }
}
