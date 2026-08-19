import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CONVERSATION_MEMBER_COLLECTION } from '../../constants';

export type ConversationMemberDocument = HydratedDocument<ConversationMemberEntity>;

// Membership is derived, not declared: an email becomes a member of a
// conversation the moment it sends into it (see ChatService.sendMessage).
// There is no invite flow in this system yet — this is the minimal fact
// needed for ws-gateway to authorize a `chat:{conversationId}` channel join.
@Schema({ collection: CONVERSATION_MEMBER_COLLECTION, timestamps: { createdAt: true, updatedAt: false } })
export class ConversationMemberEntity {
  @Prop({ required: true, index: true })
  conversationId!: string;

  @Prop({ required: true })
  email!: string;

  createdAt!: Date;
}

export const ConversationMemberSchema = SchemaFactory.createForClass(ConversationMemberEntity);

// Upsert target for repo.addMember() — also prevents duplicate membership rows.
ConversationMemberSchema.index({ conversationId: 1, email: 1 }, { unique: true });
