import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsEmail()
  @ApiProperty({ example: 'alice@example.com', description: 'Sender user email' })
  senderEmail!: string;

  @IsString()
  @MinLength(1)
  @ApiProperty({ example: 'hey, you there?' })
  body!: string;
}
