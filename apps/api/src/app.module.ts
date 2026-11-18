import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizListController } from './quiz-list.controller';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { RoomGateway } from './room.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, AuthController, QuizController, QuizListController, RoomController],
  providers: [AuthService, QuizService, RoomService, RoomGateway],
})
export class AppModule {}