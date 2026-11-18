import type { Quiz } from '@quizz/shared';

const API_BASE = 'http://localhost:3000/api';

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Erreur lors de la requête.');
  }

  return payload as T;
}

export async function listQuizzes(): Promise<Quiz[]> {
  return apiRequest<Quiz[]>('/quizz');
}
