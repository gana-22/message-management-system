import { ApiProperty } from '@nestjs/swagger';
import { CreateMessageDto } from './create-message.dto';

export class CreateMessageResponse extends CreateMessageDto {
  @ApiProperty({ example: '67f3eedc07be4c7a83ba54e2' })
  _id: string;

  @ApiProperty({ example: '2025-04-07T15:27:24.243Z' })
  timestamp: string;

  @ApiProperty({ example: '2025-04-07T15:27:24.244Z' })
  createdAt: string;

  @ApiProperty({ example: '2025-04-07T15:27:24.244Z' })
  updatedAt: string;

  @ApiProperty({ example: 0 })
  __v: number;
}

export class MessagesArrayResponse {
  @ApiProperty({
    type: [CreateMessageResponse],
  })
  messages: CreateMessageResponse[];

  @ApiProperty({
    example: 1,
  })
  total: number;
}
