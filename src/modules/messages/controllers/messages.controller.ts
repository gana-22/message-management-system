/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Delete,
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
  ApiHeader,
} from '@nestjs/swagger';
import { MessagesService } from '../services/messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import {
  CreateMessageResponse,
  MessagesArrayResponse,
} from '../dto/message-response.dto';
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
    required: true,
  })
  @ApiBody({ type: CreateMessageDto })
  @ApiResponse({
    status: 201,
    type: CreateMessageResponse,
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
    required: true,
    type: String,
  })
  @ApiResponse({
    status: 200,
    type: MessagesArrayResponse,
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
    required: true,
    type: String,
  })
  @ApiResponse({
    status: 200,
    type: MessagesArrayResponse,
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

  @Delete('conversations/:conversationId')
  @UsePipes(new ValidationPipe({ transform: true }))
  async deleteConversation(@Param('conversationId') conversationId: string) {
    try {
      return this.messagesService.deleteConversation(conversationId);
    } catch (error) {
      throw new HttpException(
        `Failed to delete conversation: ${error?.message || error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
