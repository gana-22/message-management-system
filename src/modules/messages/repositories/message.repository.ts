import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';

@Injectable()
export class MessageRepository {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // creates a new message
  async create(createMessageDto: CreateMessageDto): Promise<Message> {
    const createdMessage = new this.messageModel(createMessageDto);
    return createdMessage.save();
  }

  // find message's conversation by conversation id with optional query params
  async findByConversationId(
    conversationId: string,
    queryDto: QueryMessagesDto,
  ): Promise<{ messages: Message[]; total: number }> {
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

    return { messages, total };
  }

  // find message's conversation by id
  async findById(id: string): Promise<Message | null> {
    return this.messageModel.findById(id).exec();
  }
}
