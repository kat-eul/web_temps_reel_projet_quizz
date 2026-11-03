import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('quizz')
export class QuizListController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.quiz.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        createur: true,
      },
    });
  }
}

