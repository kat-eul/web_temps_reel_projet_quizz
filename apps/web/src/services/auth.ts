import type { AuthResponse, LoginUserInput, RegisterUserInput } from '@quizz/shared';

const API_BASE = '/api';

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

export function isSessionValid(): boolean {
  const token = localStorage.getItem('quizz_token');
  if (!token) {
    clearSession();
    return false;
  }

  try {
    const parts = token.split('.');
    if (
      parts.length !== 3 ||
      parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))
    ) {
      clearSession();
      return false;
    }

    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decodedPayload = atob(paddedPayload);
    const bytes = Uint8Array.from(decodedPayload, (character) => character.charCodeAt(0));
    const parsedPayload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsedPayload !== 'object' ||
      parsedPayload === null ||
      !('exp' in parsedPayload) ||
      typeof parsedPayload.exp !== 'number' ||
      !Number.isFinite(parsedPayload.exp) ||
      parsedPayload.exp <= Date.now() / 1000
    ) {
      clearSession();
      return false;
    }

    return true;
  } catch {
    clearSession();
    return false;
  }
}

export function handleUnauthorized() {
  clearSession();
  window.location.assign('/login');
}

export function getStoredSession() {
  if (!isSessionValid()) {
    return null;
  }

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
