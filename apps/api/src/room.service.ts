import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { parseQuizString, QuizParseError, QuizYamlSyntaxError } from './quiz-engine/parser/index.js';
import { CreateRoomInput, Room, RoomStarted } from '@quizz/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly questionDurationMs = 30_000;
  private roomVersion = 0;
  private readonly pendingPolls = new Set<(changed: boolean) => void>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // au démarrage aucun socket n'est connecté
    await this.prisma.room.updateMany({ where: { state: 'IN_PROGRESS' }, data: { state: 'FINISHED' } });
    await this.prisma.roomParticipant.deleteMany({ where: { room: { state: 'WAITING' } } });
    await this.deleteEmptyRooms();
  }

  async list(): Promise<Room[]> {
    const rooms = await this.prisma.room.findMany({
      where: { state: 'WAITING' },
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => this.toRoom(room));
  }

  async getById(id: number): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }

    return this.toRoom(room);
  }

  async getAccess(
    roomId: number,
    userId: number,
  ): Promise<{
    exists: boolean;
    isMember: boolean;
    isOwner: boolean;
    state: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | null;
  }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        ownerId: true,
        state: true,
        participants: {
          where: { userId },
          select: { userId: true },
          take: 1,
        },
      },
    });

    if (!room) {
      return { exists: false, isMember: false, isOwner: false, state: null };
    }

    const isOwner = room.ownerId === userId;
    return {
      exists: true,
      isMember: isOwner || room.participants.length > 0,
      isOwner,
      state: room.state,
    };
  }

  async getStartData(roomId: number): Promise<{
    quizYaml: string;
    maxPlayers: number;
    ownerId: number;
    state: 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
    members: { userId: number; pseudo: string }[];
  }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: { include: { user: { select: { pseudo: true } } } } },
    });
    if (!room) {
      throw new NotFoundException('Salle introuvable.');
    }
    return {
      quizYaml: room.quizYaml,
      maxPlayers: room.nbMaxParticipants,
      ownerId: room.ownerId,
      state: room.state,
      members: room.participants.map((p) => ({ userId: p.userId, pseudo: p.user.pseudo })),
    };
  }

  async markInProgress(roomId: number): Promise<void> {
    await this.prisma.room.update({ where: { id: roomId }, data: { state: 'IN_PROGRESS' } });
    this.notifyChanged();
  }

  async markFinished(roomId: number): Promise<void> {
    await this.prisma.room.update({ where: { id: roomId }, data: { state: 'FINISHED' } });
    this.notifyChanged();
  }

  async deleteRoom(roomId: number): Promise<void> {
    await this.prisma.room.deleteMany({ where: { id: roomId } });
    this.notifyChanged();
  }

  async create(input: CreateRoomInput, ownerId: number): Promise<Room> {
    try {
      parseQuizString(input.quizYaml);
    } catch (err) {
      if (err instanceof QuizParseError) {
        throw new BadRequestException({ message: 'Quiz invalide', issues: err.issues });
      }
      if (err instanceof QuizYamlSyntaxError) {
        throw new BadRequestException({ message: 'Quiz invalide', issues: [err.message] });
      }
      throw err;
    }

    const existing = await this.prisma.room.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new ConflictException('Une salle avec ce nom existe déjà.');
    }

    const room = await this.prisma.room.create({
      data: {
        name: input.name.trim(),
        nbMaxParticipants: input.nbMaxParticipants,
        nbParticipants: 0,
        quizYaml: input.quizYaml,
        ownerId,
      },
    });

    const createdRoom = this.toRoom(room);
    this.notifyChanged();
    return createdRoom;
  }

  async join(roomId: number, userId: number): Promise<Room> {
    const joined = await this.prisma.$transaction(async (tx) => {
      const lockedRooms = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
      `;
      if (lockedRooms.length === 0) {
        throw new NotFoundException('Salle introuvable.');
      }
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;

      const existingMembership = await tx.roomParticipant.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      if (room.state !== 'WAITING') {
        if (existingMembership) {
          return room;
        }
        throw new ConflictException('Cette partie a déjà commencé.');
      }
      if (existingMembership) {
        return room;
      }

      const otherMembership = await tx.roomParticipant.findFirst({
        where: { userId, roomId: { not: roomId }, room: { state: { not: 'FINISHED' } } },
        include: { room: true },
      });
      if (otherMembership) {
        throw new ConflictException('Vous êtes déjà connecté à une autre salle.');
      }

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });
      if (room.state !== 'WAITING') {
        throw new ConflictException('Cette partie a déjà commencé.');
      }
      if (nbParticipants >= room.nbMaxParticipants) {
        throw new ConflictException('La salle est complète.');
      }

      await tx.roomParticipant.create({
        data: { roomId, userId },
      });

      const updated = await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants: nbParticipants + 1 },
      });

      return updated;
    });

    this.notifyChanged();
    return this.toRoom(joined);
  }

  async start(_roomId: number, _userId: number): Promise<RoomStarted> {
    throw new ConflictException('Le déroulement de la partie sera disponible prochainement.');
  }

  async getGameState(_roomId: number): Promise<RoomStarted | null> {
    return null;
  }

  async leave(roomId: number, userId: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
      `;

      await tx.roomParticipant.deleteMany({
        where: { roomId, userId },
      });

      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });

      if (nbParticipants === 0) {
        const deleted = await tx.room.deleteMany({
          where: {
            id: roomId,
            participants: { none: {} },
          },
        });
        if (deleted.count > 0) {
          this.notifyChanged();
        }
        return deleted.count > 0;
      }

      await tx.room.update({
        where: { id: roomId },
        data: { nbParticipants },
      });
      this.notifyChanged();
      return false;
    });
  }

  async removeParticipant(roomId: number, userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.roomParticipant.deleteMany({ where: { roomId, userId } });
      const nbParticipants = await tx.roomParticipant.count({ where: { roomId } });
      await tx.room.update({ where: { id: roomId }, data: { nbParticipants } });
    });
    this.notifyChanged();
  }

  async deleteEmptyRooms(): Promise<number> {
    const result = await this.prisma.room.deleteMany({
      where: { participants: { none: {} } },
    });
    if (result.count > 0) {
      this.notifyChanged();
    }
    return result.count;
  }

  async poll(version: number): Promise<{
    rooms: Room[];
    version: number;
    changed: boolean;
  }> {
    if (version !== this.roomVersion) {
      return {
        rooms: await this.list(),
        version: this.roomVersion,
        changed: true,
      };
    }

    const changed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPolls.delete(resolvePoll);
        resolve(false);
      }, 30_000);

      const resolvePoll = (hasChanged: boolean) => {
        clearTimeout(timeout);
        this.pendingPolls.delete(resolvePoll);
        resolve(hasChanged);
      };

      this.pendingPolls.add(resolvePoll);
    });

    return {
      rooms: await this.list(),
      version: this.roomVersion,
      changed,
    };
  }

  private notifyChanged(): void {
    this.roomVersion += 1;
    for (const resolve of Array.from(this.pendingPolls)) {
      resolve(true);
    }
  }

  private toRoom(room: {
    id: number;
    name: string;
    nbMaxParticipants: number;
    nbParticipants: number;
    ownerId: number;
    state: 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
    createdAt: Date;
  }): Room {
    return {
      id: room.id,
      name: room.name,
      nbMaxParticipants: room.nbMaxParticipants,
      nbParticipants: room.nbParticipants,
      ownerId: room.ownerId,
      state: room.state,
      createdAt: room.createdAt.toISOString(),
    };
  }
}