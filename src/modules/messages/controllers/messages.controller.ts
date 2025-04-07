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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { MessagesService } from '../services/messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { SearchMessagesDto } from '../dto/search-messages.dto';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

@ApiTags('Messages')
@Controller('api')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post('messages')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Create a new message' })
  @ApiHeader({
    name: 'user-role',
    description: 'Authorization User Role',
    required: true,
    schema: { enum: ['admin', 'user'] },
  })
  @ApiBody({ type: CreateMessageDto })
  @ApiResponse({
    status: 201,
    description: 'The message has been successfully created',
    schema: {
      example: {
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello earth2',
        metadata: { a: 'b' },
        _id: '67f3eedc07be4c7a83ba54e2',
        timestamp: '2025-04-07T15:27:24.243Z',
        createdAt: '2025-04-07T15:27:24.244Z',
        updatedAt: '2025-04-07T15:27:24.244Z',
        __v: 0,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
  @ApiOperation({ summary: 'Get messages by conversation id' })
  @ApiParam({
    name: 'conversationId',
    description: 'Fetch messages based on conversation id',
    required: true,
    type: String,
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Limit of messages per page (max 100)',
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: 'sortBy',
    description: 'Sort messages by',
    required: false,
    type: String,
    example: 'timestamp',
  })
  @ApiQuery({
    name: 'sortOrder',
    description: 'Sort order (asc or desc)',
    required: false,
    type: String,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    schema: {
      example: {
        messages: [
          {
            _id: '67f3eedc07be4c7a83ba54e2',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello earth2',
            metadata: { a: 'b' },
            timestamp: '2025-04-07T15:27:24.243Z',
            createdAt: '2025-04-07T15:27:24.244Z',
            updatedAt: '2025-04-07T15:27:24.244Z',
            __v: 0,
          },
        ],
        total: 1,
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
  @ApiOperation({ summary: 'Search messages in a conversation' })
  @ApiParam({
    name: 'conversationId',
    description: 'Search messages in conversation based on conversation id',
    required: true,
    type: String,
  })
  @ApiQuery({
    name: 'q',
    description: 'Search query term',
    required: true,
    type: String,
    example: 'hello',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of messages per page (max 100)',
    required: false,
    type: Number,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Messages found successfully',
    schema: {
      example: {
        messages: [
          {
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello earth2',
            metadata: { a: 'b' },
            timestamp: '2025-04-07T15:27:24.243Z',
            createdAt: '2025-04-07T15:27:24.244Z',
            updatedAt: '2025-04-07T15:27:24.244Z',
          },
        ],
        total: 1,
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
