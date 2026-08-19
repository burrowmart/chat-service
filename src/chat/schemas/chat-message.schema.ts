import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MONGO_COLLECTION } from '../../constants';

export type ChatMessageDocument = HydratedDocument<ChatMessageEntity>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: MONGO_COLLECTION })
export class ChatMessageEntity {
  @Prop({ required: true, index: true })
  conversationId!: string;

  // Assigned atomically by ConversationCountersRepository.nextSeq() before this
  // document is created — never generated here.
  @Prop({ required: true })
  seq!: number;

  @Prop({ required: true })
  senderEmail!: string;

  @Prop({ required: true })
  body!: string;

  createdAt!: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageEntity);

// Enforces gaplessness/uniqueness at the storage layer as a safety net over
// the atomic counter — two writes can never land on the same (conversationId, seq).
ChatMessageSchema.index({ conversationId: 1, seq: 1 }, { unique: true });
