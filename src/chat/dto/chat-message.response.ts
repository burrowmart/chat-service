import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageResponse {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty({ description: 'Monotonic per-conversation sequence number, gapless from 1' })
  seq!: number;
  @ApiProperty() senderEmail!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: string;
}

export class ChatMessagePageResponse {
  @ApiProperty({ type: [ChatMessageResponse] }) data!: ChatMessageResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
