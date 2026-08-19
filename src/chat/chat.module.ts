import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatController } from './chat.controller';
import { PresenceController } from './presence.controller';
import { ChatMessagesRepository } from './chat-messages.repository';
import { ConversationMembersRepository } from './conversation-members.repository';
import { ChatService } from './chat.service';
import { ChatMessageEntity, ChatMessageSchema } from './schemas/chat-message.schema';
import {
  ConversationCounterEntity,
  ConversationCounterSchema,
} from './schemas/conversation-counter.schema';
import {
  ConversationMemberEntity,
  ConversationMemberSchema,
} from './schemas/conversation-member.schema';
import { ChatRedisModule } from './redis/chat-redis.module';
import { ChatRedisService } from './redis/chat-redis.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatMessageEntity.name, schema: ChatMessageSchema },
      { name: ConversationCounterEntity.name, schema: ConversationCounterSchema },
      { name: ConversationMemberEntity.name, schema: ConversationMemberSchema },
    ]),
    ChatRedisModule,
  ],
  controllers: [ChatController, PresenceController],
  providers: [ChatService, ChatMessagesRepository, ConversationMembersRepository, ChatRedisService],
})
export class ChatModule {}
