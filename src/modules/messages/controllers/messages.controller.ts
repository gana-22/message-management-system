/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MessagesService } from '../services/messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { SearchMessagesDto } from '../dto/search-messages.dto';

@Controller('api')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post('messages')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createMessage(@Body() createMessageDto: CreateMessageDto) {
    try {
      return this.messagesService.createMessage(createMessageDto);
    } catch (error) {
      throw new HttpException(
        `Failed to create message: ${error?.message || error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('conversations/:conversationId/messages')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMessagesByConversationId(
    @Param('conversationId') conversationId: string,
    @Query() queryDto: QueryMessagesDto,
  ) {
    try {
      return this.messagesService.getMessagesByConversationId(
        conversationId,
        queryDto,
      );
    } catch (error) {
      throw new HttpException(
        `Failed to retrieve message: ${error?.message || error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('conversations/:conversationId/messages/search')
  @UsePipes(new ValidationPipe({ transform: true }))
  async searchMessages(
    @Param('conversationId') conversationId: string,
    @Query() searchDto: SearchMessagesDto,
  ) {
    try {
      return this.messagesService.searchMessages(conversationId, searchDto);
    } catch (error) {
      throw new HttpException(
        `Failed to search message: ${error?.message || error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
