import type { CreateRoomInput, Room } from '@quizz/shared';

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

export async function listRooms(): Promise<Room[]> {
  return apiRequest<Room[]>('/rooms');
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  return apiRequest<Room>('/rooms', input);
}

