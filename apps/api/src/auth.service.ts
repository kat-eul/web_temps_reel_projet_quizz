import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { createHmac, randomBytes, scryptSync } from 'crypto';
import { AuthResponse, LoginUserInput, RegisterUserInput, UserPublic } from '@quizz/shared';
import { PrismaService } from './prisma.service';

const ADMIN_EMAIL = 'admin@quizz.local';
const ADMIN_PSEUDO = 'admin';
const ADMIN_PASSWORD = 'admin';
const TOKEN_SECRET = process.env.JWT_SECRET ?? 'quizz-local-secret';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {
    void this.ensureAdminAccount();
  }

  async register(data: RegisterUserInput): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { pseudo: data.pseudo }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Un compte avec cet email ou ce pseudo existe déjà.');
    }

    const user = await this.prisma.user.create({
      data: {
        pseudo: data.pseudo.trim(),
        email: data.email.trim().toLowerCase(),
        password: hashPassword(data.password),
        role: 'USER',
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(data: LoginUserInput): Promise<AuthResponse> {
    const identifier = (data.identifier ?? data.email ?? '').trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { pseudo: identifier },
        ],
      },
    });

    if (!user || !verifyPassword(data.password, user.password)) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    return this.buildAuthResponse(user);
  }

  async me(token: string) {
    const payload = this.verifyToken(token);
    if (!payload) {
      throw new UnauthorizedException('Token invalide.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    return this.buildAuthResponse(user);
  }

  private async ensureAdminAccount() {
    const admin = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: ADMIN_EMAIL }, { pseudo: ADMIN_PSEUDO }],
      },
    });

    if (admin) {
      return;
    }

    await this.prisma.user.create({
      data: {
        pseudo: ADMIN_PSEUDO,
        email: ADMIN_EMAIL,
        password: hashPassword(ADMIN_PASSWORD),
        role: UserRole.ADMIN,
      },
    });
  }

  private buildAuthResponse(user: Prisma.UserGetPayload<Record<string, never>>): AuthResponse {
    const publicUser: UserPublic = {
      id: user.id,
      pseudo: user.pseudo,
      email: user.email,
      role: user.role,
    };

    return {
      user: publicUser,
      token: createToken(user.id, user.role),
    };
  }

  private verifyToken(token: string) {
    const raw = token.replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('hex');

    if (signature !== expected) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        userId: number;
        role: UserRole;
        exp: number;
      };

      if (decoded.exp < Date.now() / 1000) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, hash: string) {
  const [salt, originalHash] = hash.split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64).toString('hex');
  return candidate === originalHash;
}

function createToken(userId: number, role: UserRole) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('hex');

  return `${header}.${payload}.${signature}`;
}

