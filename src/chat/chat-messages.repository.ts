import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatMessageEntity, ChatMessageDocument } from './schemas/chat-message.schema';
import {
  ConversationCounterEntity,
  ConversationCounterDocument,
} from './schemas/conversation-counter.schema';

@Injectable()
export class ChatMessagesRepository {
  constructor(
    @InjectModel(ChatMessageEntity.name)
    private readonly messageModel: Model<ChatMessageDocument>,
    @InjectModel(ConversationCounterEntity.name)
    private readonly counterModel: Model<ConversationCounterDocument>,
  ) {}

  // Atomic on the DB, upsert-safe under concurrency, and survives restarts/replicas
  // because the counter lives in Mongo — never in process memory.
  async nextSeq(conversationId: string): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: conversationId },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .exec();
    return counter!.seq;
  }

  async createMessage(input: {
    conversationId: string;
    seq: number;
    senderEmail: string;
    body: string;
  }): Promise<ChatMessageDocument> {
    return this.messageModel.create(input);
  }

  async findAfterSeq(
    conversationId: string,
    afterSeq: number,
    page: number,
    limit: number,
  ): Promise<{ data: ChatMessageDocument[]; total: number }> {
    const filter = { conversationId, seq: { $gt: afterSeq } };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.messageModel.find(filter).sort({ seq: 1 }).skip(skip).limit(limit).exec(),
      this.messageModel.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }
}
