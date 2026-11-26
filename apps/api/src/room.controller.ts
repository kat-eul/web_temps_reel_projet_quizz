import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UsePipes } from '@nestjs/common';
import { CreateRoomSchema, Room, RoomPollResponse, RoomPollSchema } from '@quizz/shared';
import { ZodValidationPipe } from './zod-validation.pipe';
import { RoomService } from './room.service';
import { AuthService } from './auth.service';

@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async list(): Promise<Room[]> {
    return this.roomService.list();
  }

  @Get('poll')
  @UsePipes(new ZodValidationPipe(RoomPollSchema))
  async poll(@Query() query: { version: number }): Promise<RoomPollResponse> {
    return this.roomService.poll(query.version);
  }

  @Get(':id/access')
  async getAccess(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{
    exists: boolean;
    isMember: boolean;
    isOwner: boolean;
    state: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | null;
  }> {
    const authorization = req.headers.authorization ?? '';
    const userId = this.authService.getAuthenticatedUserId(authorization);
    return this.roomService.getAccess(id, userId);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number): Promise<Room> {
    return this.roomService.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateRoomSchema))
  async create(@Req() req: any, @Body() body: any): Promise<Room> {
    const authorization = req.headers.authorization ?? '';
    const ownerId = this.authService.getAuthenticatedUserId(authorization);
    return this.roomService.create(body, ownerId);
  }

  @Post(':id/join')
  async join(@Req() req: any, @Param('id', ParseIntPipe) id: number): Promise<Room> {
    const authorization = req.headers.authorization ?? '';
    const userId = this.authService.getAuthenticatedUserId(authorization);
    return this.roomService.join(id, userId);
  }

  @Post(':id/leave')
  async leave(@Req() req: any, @Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    const authorization = req.headers.authorization ?? '';
    const userId = this.authService.getAuthenticatedUserId(authorization);
    const deleted = await this.roomService.leave(id, userId);
    return { deleted };
  }
}
