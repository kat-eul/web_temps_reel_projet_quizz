import { Controller, Get } from '@nestjs/common';
import { Health } from '@quizz/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): Health {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
