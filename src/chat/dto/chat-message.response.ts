import { ApiProperty } from '@nestjs/swagger';

// type: 'integer' and the format hints are explicit throughout — TS `number`
// would emit the wider `type: number`, and a bare `string` would drop the
// email/date-time formats declared in ../contracts/openapi/chat-service.yaml.
export class ChatMessageResponse {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    description: 'Monotonic per-conversation sequence number, gapless from 1',
  })
  seq!: number;
  @ApiProperty({ format: 'email' }) senderEmail!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ChatMessagePageResponse {
  @ApiProperty({ type: [ChatMessageResponse] }) data!: ChatMessageResponse[];
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) page!: number;
  @ApiProperty({ type: 'integer' }) limit!: number;
}
