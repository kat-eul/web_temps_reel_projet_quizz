import type { CreateRoomInput, Room, RoomPollResponse } from '@quizz/shared';
import { getStoredSession } from './auth';

const API_BASE = 'http://localhost:3000/api';

export async function listRooms(): Promise<Room[]> {
  const response = await fetch(`${API_BASE}/rooms`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Impossible de charger les salles.');
  }
  return payload as Room[];
}

export async function pollRooms(
  version: number,
  signal: AbortSignal,
): Promise<RoomPollResponse> {
  const response = await fetch(`${API_BASE}/rooms/poll?version=${version}`, {
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Impossible de surveiller les salles.');
  }
  return payload as RoomPollResponse;
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const session = getStoredSession();
  if (!session) {
    throw new Error('Vous devez etre connecte pour creer une salle.');
  }

  const response = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Impossible de creer la salle.');
  }
  return payload as Room;
}

export async function joinRoom(roomId: number): Promise<Room> {
  const session = getStoredSession();
  if (!session) {
    throw new Error('Vous devez etre connecte pour rejoindre une salle.');
  }

  const response = await fetch(`${API_BASE}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Impossible de rejoindre la salle.');
  }
  return payload as Room;
}
