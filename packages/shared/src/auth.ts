import { z } from 'zod';

export const UserRoleSchema = z.enum(['ADMIN', 'USER']);

export const RegisterUserSchema = z.object({
  pseudo: z.string().trim().min(3).max(30),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
});

export const LoginUserSchema = z.object({
  identifier: z.string().trim().min(3).max(50).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(6).max(100),
}).refine((values) => Boolean(values.identifier || values.email), {
  message: 'Un identifiant ou un email est requis',
  path: ['identifier'],
});

export const UserPublicSchema = z.object({
  id: z.number(),
  pseudo: z.string(),
  email: z.string(),
  role: UserRoleSchema,
});

export const AuthResponseSchema = z.object({
  user: UserPublicSchema,
  token: z.string(),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
export type LoginUserInput = z.infer<typeof LoginUserSchema>;
export type UserPublic = z.infer<typeof UserPublicSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
