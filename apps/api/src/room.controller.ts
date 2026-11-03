import { Body, Controller, Get, Param, ParseIntPipe, Post, UsePipes } from '@nestjs/common';
import { CreateRoomSchema, Room } from '@quizz/shared';
import { ZodValidationPipe } from './zod-validation.pipe';
import { RoomService } from './room.service';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  async list(): Promise<Room[]> {
    return this.roomService.list();
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number): Promise<Room> {
    return this.roomService.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateRoomSchema))
  async create(@Body() body: any): Promise<Room> {
    return this.roomService.create(body);
  }
}

