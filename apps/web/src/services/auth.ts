import type { AuthResponse, LoginUserInput, RegisterUserInput } from '@quizz/shared';

const API_BASE = 'http://localhost:3000/api';

async function apiRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Erreur lors de la requête.');
  }

  return payload as T;
}

export async function registerUser(input: RegisterUserInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', input);
}

export async function loginUser(input: LoginUserInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', input);
}

export function storeSession(session: AuthResponse) {
  localStorage.setItem('quizz_token', session.token);
  localStorage.setItem('quizz_user', JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem('quizz_token');
  localStorage.removeItem('quizz_user');
}

export function getStoredSession() {
  const token = localStorage.getItem('quizz_token');
  const user = localStorage.getItem('quizz_user');

  if (!token || !user) {
    return null;
  }

  return {
    token,
    user: JSON.parse(user),
  };
}

