import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { COUNTER_COLLECTION } from '../../constants';

export type ConversationCounterDocument = HydratedDocument<ConversationCounterEntity>;

// One document per conversation; _id IS the conversationId (no separate index needed).
// seq is advanced exclusively via $inc through findOneAndUpdate — never read-modify-write
// in application code — so it stays correct across concurrent requests and replicas.
@Schema({ collection: COUNTER_COLLECTION, versionKey: false })
export class ConversationCounterEntity {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}

export const ConversationCounterSchema = SchemaFactory.createForClass(ConversationCounterEntity);
