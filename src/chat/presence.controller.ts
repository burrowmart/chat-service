import { Controller, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';

@ApiTags('presence')
@Controller('presence')
export class PresenceController {
  constructor(private readonly service: ChatService) {}

  @Put(':email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Refreshes the 30s presence TTL key for this email (Redis only)' })
  heartbeat(@Param('email') email: string) {
    return this.service.heartbeatPresence(email);
  }

  @Get(':email')
  @ApiOkResponse({ description: 'Whether the presence key is currently live' })
  read(@Param('email') email: string) {
    return this.service.getPresence(email);
  }
}
