import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationMemberEntity,
  ConversationMemberDocument,
} from './schemas/conversation-member.schema';

@Injectable()
export class ConversationMembersRepository {
  constructor(
    @InjectModel(ConversationMemberEntity.name)
    private readonly memberModel: Model<ConversationMemberDocument>,
  ) {}

  // Idempotent — upsert so a sender's Nth message in a conversation is a no-op,
  // not a duplicate-key error against the unique (conversationId, email) index.
  async addMember(conversationId: string, email: string): Promise<void> {
    await this.memberModel
      .updateOne({ conversationId, email }, { $setOnInsert: { conversationId, email } }, { upsert: true })
      .exec();
  }

  async isMember(conversationId: string, email: string): Promise<boolean> {
    const doc = await this.memberModel.exists({ conversationId, email });
    return doc !== null;
  }
}
