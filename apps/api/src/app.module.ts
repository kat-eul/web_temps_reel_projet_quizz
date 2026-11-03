import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, AuthController, QuizController],
  providers: [AuthService, QuizService],
})
export class AppModule {}
