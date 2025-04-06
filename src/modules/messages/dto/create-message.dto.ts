import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateMessageDto {
  @IsNotEmpty()
  @IsString()
  conversationId: string;

  @IsNotEmpty()
  @IsString()
  senderId: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
