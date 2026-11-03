import { Body, Controller, Get, Post, Req, UsePipes } from '@nestjs/common';
import { AuthResponse, LoginUserSchema, RegisterUserSchema } from '@quizz/shared';
import { ZodValidationPipe } from './zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterUserSchema))
  async register(@Body() body: any): Promise<AuthResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginUserSchema))
  async login(@Body() body: any): Promise<AuthResponse> {
    return this.authService.login(body);
  }

  @Get('me')
  async me(@Req() req: any): Promise<AuthResponse> {
    const authorization = req.headers.authorization ?? '';
    return this.authService.me(authorization);
  }
}

