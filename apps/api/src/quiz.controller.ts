import { Controller, Get, Param, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('quizz')
export class QuizController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getQuiz(@Param('id', ParseIntPipe) id: number) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz introuvable.');
    }

    return quiz;
  }
}

