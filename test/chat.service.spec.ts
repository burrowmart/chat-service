import { Test, TestingModule } from '@nestjs/testing';
import { ChatMessagesRepository } from '../src/chat/chat-messages.repository';
import { ConversationMembersRepository } from '../src/chat/conversation-members.repository';
import { ChatRedisService } from '../src/chat/redis/chat-redis.service';
import { ChatService } from '../src/chat/chat.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const mockRepo: jest.Mocked<ChatMessagesRepository> = {
  nextSeq: jest.fn(),
  createMessage: jest.fn(),
  findAfterSeq: jest.fn(),
} as any;

const mockMembers: jest.Mocked<ConversationMembersRepository> = {
  addMember: jest.fn(),
  isMember: jest.fn(),
} as any;

const mockRedis: jest.Mocked<ChatRedisService> = {
  publish: jest.fn(),
  heartbeatPresence: jest.fn(),
  isOnline: jest.fn(),
  setTyping: jest.fn(),
  getTypingEmails: jest.fn(),
} as any;

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatMessagesRepository, useValue: mockRepo },
        { provide: ConversationMembersRepository, useValue: mockMembers },
        { provide: ChatRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(ChatService);
    jest.clearAllMocks();
    mockMembers.addMember.mockResolvedValue(undefined);
  });

  describe('sendMessage', () => {
    it('allocates seq, persists, and publishes the message', async () => {
      mockRepo.nextSeq.mockResolvedValue(3);
      mockRepo.createMessage.mockResolvedValue({
        _id: 'abc',
        conversationId: 'c1',
        seq: 3,
        senderEmail: 'a@example.com',
        body: 'hi',
        createdAt: NOW,
      } as any);
      mockRedis.publish.mockResolvedValue(1);

      const result = await service.sendMessage('c1', { senderEmail: 'a@example.com', body: 'hi' });

      expect(mockRepo.nextSeq).toHaveBeenCalledWith('c1');
      expect(mockRepo.createMessage).toHaveBeenCalledWith({
        conversationId: 'c1',
        seq: 3,
        senderEmail: 'a@example.com',
        body: 'hi',
      });
      expect(mockMembers.addMember).toHaveBeenCalledWith('c1', 'a@example.com');
      expect(mockRedis.publish).toHaveBeenCalledWith('c1', expect.objectContaining({ seq: 3 }));
      expect(result).toEqual({
        id: 'abc',
        conversationId: 'c1',
        seq: 3,
        senderEmail: 'a@example.com',
        body: 'hi',
        createdAt: NOW.toISOString(),
      });
    });

    it('returns the persisted message even when the pub/sub publish fails', async () => {
      mockRepo.nextSeq.mockResolvedValue(1);
      mockRepo.createMessage.mockResolvedValue({
        _id: 'abc',
        conversationId: 'c1',
        seq: 1,
        senderEmail: 'a@example.com',
        body: 'hi',
        createdAt: NOW,
      } as any);
      mockRedis.publish.mockRejectedValue(new Error('redis down'));

      const result = await service.sendMessage('c1', { senderEmail: 'a@example.com', body: 'hi' });

      expect(result.seq).toBe(1);
    });
  });

  describe('listMessages', () => {
    it('returns a paginated envelope from the repository', async () => {
      mockRepo.findAfterSeq.mockResolvedValue({
        data: [
          {
            _id: 'abc',
            conversationId: 'c1',
            seq: 5,
            senderEmail: 'a@example.com',
            body: 'hi',
            createdAt: NOW,
          } as any,
        ],
        total: 1,
      });

      const result = await service.listMessages('c1', 4, 1, 20);

      expect(mockRepo.findAfterSeq).toHaveBeenCalledWith('c1', 4, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].seq).toBe(5);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('presence', () => {
    it('heartbeats and reads online status', async () => {
      mockRedis.heartbeatPresence.mockResolvedValue('OK');
      mockRedis.isOnline.mockResolvedValue(true);

      await service.heartbeatPresence('a@example.com');
      expect(mockRedis.heartbeatPresence).toHaveBeenCalledWith('a@example.com');

      const result = await service.getPresence('a@example.com');
      expect(result).toEqual({ email: 'a@example.com', online: true });
    });
  });

  describe('membership', () => {
    it('delegates isMember to the repository', async () => {
      mockMembers.isMember.mockResolvedValue(true);

      const result = await service.isMember('c1', 'a@example.com');

      expect(mockMembers.isMember).toHaveBeenCalledWith('c1', 'a@example.com');
      expect(result).toBe(true);
    });
  });

  describe('typing', () => {
    it('sets and reads typing users', async () => {
      mockRedis.setTyping.mockResolvedValue('OK');
      mockRedis.getTypingEmails.mockResolvedValue(['a@example.com']);

      await service.setTyping('c1', 'a@example.com');
      expect(mockRedis.setTyping).toHaveBeenCalledWith('c1', 'a@example.com');

      const result = await service.getTyping('c1');
      expect(result).toEqual({ conversationId: 'c1', typing: ['a@example.com'] });
    });
  });
});
