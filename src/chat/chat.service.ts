import { Injectable, Logger } from '@nestjs/common';
import type { Paginated } from '@demo/contracts';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ConversationMembersRepository } from './conversation-members.repository';
import { ChatRedisService } from './redis/chat-redis.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatMessageDocument } from './schemas/chat-message.schema';
import { ChatMessageResponse } from './dto/chat-message.response';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repo: ChatMessagesRepository,
    private readonly members: ConversationMembersRepository,
    private readonly redis: ChatRedisService,
  ) {}

  async sendMessage(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<ChatMessageResponse> {
    const seq = await this.repo.nextSeq(conversationId);
    const doc = await this.repo.createMessage({
      conversationId,
      seq,
      senderEmail: dto.senderEmail,
      body: dto.body,
    });
    // Membership is derived from participation: sending is what makes an
    // email a member, checked by ws-gateway before it allows a chat:* join.
    await this.members.addMember(conversationId, dto.senderEmail);
    const message = this.toResponse(doc);

    // Best-effort fan-out: the message is already durable in Mongo and reachable via
    // GET /conversations/:id/messages?afterSeq= by the time this runs, so a publish
    // failure (Redis down, network blip) must never fail the request or lose the
    // message — the receiver just falls back to the REST reconnect path above.
    try {
      await this.redis.publish(conversationId, message);
    } catch (err) {
      this.logger.warn(
        { err, conversationId, seq },
        'chat pub/sub publish failed — message remains durable and reachable via REST',
      );
    }

    return message;
  }

  async listMessages(
    conversationId: string,
    afterSeq: number,
    page: number,
    limit: number,
  ): Promise<Paginated<ChatMessageResponse>> {
    const { data, total } = await this.repo.findAfterSeq(conversationId, afterSeq, page, limit);
    return { data: data.map((d) => this.toResponse(d)), total, page, limit };
  }

  isMember(conversationId: string, email: string): Promise<boolean> {
    return this.members.isMember(conversationId, email);
  }

  heartbeatPresence(email: string): Promise<void> {
    return this.redis.heartbeatPresence(email).then(() => undefined);
  }

  async getPresence(email: string): Promise<{ email: string; online: boolean }> {
    return { email, online: await this.redis.isOnline(email) };
  }

  setTyping(conversationId: string, email: string): Promise<void> {
    return this.redis.setTyping(conversationId, email).then(() => undefined);
  }

  async getTyping(conversationId: string): Promise<{ conversationId: string; typing: string[] }> {
    return { conversationId, typing: await this.redis.getTypingEmails(conversationId) };
  }

  private toResponse(doc: ChatMessageDocument): ChatMessageResponse {
    return {
      id: String(doc._id),
      conversationId: doc.conversationId,
      seq: doc.seq,
      senderEmail: doc.senderEmail,
      body: doc.body,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
