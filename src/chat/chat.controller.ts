import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatMessagePageResponse, ChatMessageResponse } from './dto/chat-message.response';

@ApiTags('chat')
@Controller('conversations')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Post(':conversationId/messages')
  @ApiCreatedResponse({
    type: ChatMessageResponse,
    description: 'Message persisted and published to Redis pub/sub for fan-out',
  })
  send(@Param('conversationId') conversationId: string, @Body() dto: CreateMessageDto) {
    return this.service.sendMessage(conversationId, dto);
  }

  @Get(':conversationId/messages')
  // Declared explicitly: bare @Query() params carry no metadata, so without
  // these the generated openapi.yaml drops the query contract entirely.
  @ApiQuery({
    name: 'afterSeq',
    required: false,
    schema: { type: 'integer', minimum: 0, default: 0 },
    description: 'Return only messages with seq strictly greater than this value — the reconnect cursor',
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiOkResponse({
    type: ChatMessagePageResponse,
    description: 'Paginated messages with seq > afterSeq, ordered ascending — the reconnect path',
  })
  list(
    @Param('conversationId') conversationId: string,
    @Query('afterSeq') afterSeq = '0',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.listMessages(conversationId, +afterSeq, +page, +limit);
  }

  @Get(':conversationId/members/:email')
  @ApiOkResponse({ description: 'Email is a member of this conversation (has sent into it at least once)' })
  @ApiNotFoundResponse({ description: 'Email is not a member of this conversation' })
  async getMember(@Param('conversationId') conversationId: string, @Param('email') email: string) {
    const isMember = await this.service.isMember(conversationId, email);
    if (!isMember) throw new NotFoundException('Not a member of this conversation');
    return { conversationId, email, member: true };
  }

  @Put(':conversationId/typing/:email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Refreshes the 5s typing TTL key for this email in this conversation (Redis only)' })
  setTyping(@Param('conversationId') conversationId: string, @Param('email') email: string) {
    return this.service.setTyping(conversationId, email);
  }

  @Get(':conversationId/typing')
  @ApiOkResponse({ description: 'Emails currently typing (TTL-derived, never persisted)' })
  getTyping(@Param('conversationId') conversationId: string) {
    return this.service.getTyping(conversationId);
  }
}
