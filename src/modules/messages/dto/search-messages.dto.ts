import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchMessagesDto {
  @IsNotEmpty()
  @IsString()
  q: string;

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
}
