import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryMessagesDto {
  @ApiProperty({
    description: 'Page number',
    default: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value === null || value === undefined) {
      return 1;
    }
    const parsedValue = parseInt(value);
    return isNaN(parsedValue) || parsedValue < 1 ? 1 : parsedValue;
  })
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Limit of messages per page (max 100)',
    default: 10,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value === null || value === undefined) {
      return 10;
    }
    const parsedValue = parseInt(value);
    return isNaN(parsedValue) || parsedValue < 1 || parsedValue > 100
      ? 10
      : parsedValue;
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    description: 'Sort messages by',
    default: 'timestamp',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'timestamp';

  @ApiProperty({
    description: 'Sort order',
    default: 'desc',
    enum: ['asc', 'desc'],
    required: false,
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
