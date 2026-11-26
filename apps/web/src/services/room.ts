import type { CreateRoomInput, Room, RoomPollResponse } from '@quizz/shared';
import { getStoredSession, handleUnauthorized } from './auth';

const API_BASE = '/api';

export async function listRooms(): Promise<Room[]> {
  const response = await fetch(`${API_BASE}/rooms`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized();
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
    if (response.status === 401) handleUnauthorized();
    throw new Error(payload?.message ?? 'Impossible de surveiller les salles.');
  }
  return payload as RoomPollResponse;
}

export async function getRoomAccess(roomId: number): Promise<{
  exists: boolean;
  isMember: boolean;
  isOwner: boolean;
  state: string | null;
}> {
  const session = getStoredSession();
  if (!session) {
    throw new Error('Vous devez être connecté pour accéder à cette salle.');
  }

  const response = await fetch(`${API_BASE}/rooms/${roomId}/access`, {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(payload?.message ?? 'Votre session a expiré.');
  }
  if (response.status === 404) {
    return { exists: false, isMember: false, isOwner: false, state: null };
  }
  if (!response.ok) {
    throw new Error(payload?.message ?? 'Impossible de vérifier l’accès à la salle.');
  }
  return payload as {
    exists: boolean;
    isMember: boolean;
    isOwner: boolean;
    state: string | null;
  };
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
    if (response.status === 401) handleUnauthorized();
    const issues = Array.isArray(payload?.issues)
        ? payload.issues.map((i: unknown) => (typeof i === 'string' ? i : (i as { message?: string }).message ?? String(i)))
        : [];
    if (issues.length > 0) {
      throw new ApiValidationError(payload?.message ?? 'Quiz invalide', issues);
    }
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
    if (response.status === 401) handleUnauthorized();
    throw new Error(payload?.message ?? 'Impossible de rejoindre la salle.');
  }
  return payload as Room;
}

export class ApiValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ApiValidationError';
    this.issues = issues;
  }
}
