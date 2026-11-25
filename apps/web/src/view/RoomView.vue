<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ChatMessage, Room } from '@quizz/shared';
import { io, type Socket } from 'socket.io-client';
import { getStoredSession } from '../services/auth';
import { useRoomGame } from '../composables/useRoomGame';

const route = useRoute();
const room = ref<Room | null>(null);
const socket = ref<Socket | null>(null);
const currentUser = getStoredSession();
const { snapshot, hostConnected, ended, leaderboard } = useRoomGame(socket);
const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const chatError = ref('');
const connectionError = ref('');
const chatScroll = ref<HTMLElement | null>(null);
const starting = ref(false);
const startError = ref('');
const isOwner = computed(() => !!room.value && room.value.ownerId === currentUser?.user?.id);
const canStart = computed(
  () =>
    isOwner.value &&
    !snapshot.value &&
    room.value?.state === 'WAITING' &&
    (room.value?.nbParticipants ?? 0) >= 2,
);

onMounted(async () => {
  const roomId = Number(route.params.id);
  const response = await fetch(`/api/rooms/${roomId}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Salle introuvable.');
  }

  room.value = payload;

  const session = getStoredSession();
  if (session) {
    socket.value = io({
      auth: { token: session.token },
    });

    socket.value.on('connect', () => {
      connectionError.value = '';
      socket.value?.emit('room:join', { roomId });
    });
    socket.value.on('disconnect', () => {
      connectionError.value = 'Connexion au tchat perdue. Reconnexion en cours.';
    });
    socket.value.on('connect_error', () => {
      connectionError.value = 'Impossible de se connecter au tchat.';
    });
    socket.value.on('room:participant-updated', (updated: Room) => {
      room.value = updated;
    });
    socket.value.on('room:deleted', () => {
      room.value = null;
    });
    socket.value.on('room:chat-history', (history: ChatMessage[]) => {
      messages.value = [...history].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
      void scrollChatToBottom();
    });
    socket.value.on('room:chat-message', (message: ChatMessage) => {
      if (!messages.value.some((existing) => existing.id === message.id)) {
        messages.value.push(message);
        void scrollChatToBottom();
      }
    });
  }
});

onBeforeUnmount(() => {
  if (!socket.value || !room.value) return;
  socket.value.emit('room:leave', { roomId: room.value.id });
  socket.value.disconnect();
});

async function scrollChatToBottom() {
  await nextTick();
  if (chatScroll.value) {
    chatScroll.value.scrollTop = chatScroll.value.scrollHeight;
  }
}

function formatTime(createdAt: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

function sendMessage() {
  const content = draft.value.trim();
  chatError.value = '';

  if (!content) {
    chatError.value = 'Le message ne peut pas être vide.';
    return;
  }
  if (content.length > 500) {
    chatError.value = 'Le message ne peut pas dépasser 500 caractères.';
    return;
  }
  if (!socket.value?.connected || !room.value) {
    chatError.value = 'Vous devez être connecté pour envoyer un message.';
    return;
  }

  socket.value.emit(
    'room:chat-send',
    { roomId: room.value.id, content },
    (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        chatError.value = response.error ?? 'Impossible d’envoyer le message.';
        return;
      }
      draft.value = '';
    },
  );
}

function startGame() {
  if (!socket.value || !room.value || starting.value) return;
  starting.value = true;
  startError.value = '';
  socket.value.emit(
    'room:start',
    { roomId: room.value.id },
    (res: { ok: boolean; error?: string }) => {
      starting.value = false;
      if (!res.ok) startError.value = res.error ?? 'Impossible de lancer la partie.';
    },
  );
}
</script>

<template>
  <main class="room-page">
    <section class="room-card" v-if="room">
      <p class="eyebrow">Salle créée</p>
      <h1>{{ room.name }}</h1>
      <p>Joueurs : {{ Math.max(room.nbParticipants - 1, 0) }} / {{ room.nbMaxParticipants - 1 }}</p>
      <p v-if="snapshot">[debug F-1] État : {{ snapshot.state }} — host : {{ hostConnected }} — fin : {{ ended ? 'oui' : 'non' }} — joueurs : {{ leaderboard.length }}</p>
      <div v-if="isOwner && !snapshot" class="start-actions">
        <button class="start-button" type="button" :disabled="!canStart || starting" @click="startGame">
          Lancer la partie
        </button>
        <p v-if="room.nbParticipants < 2" class="start-hint">
          Au moins un joueur doit avoir rejoint la salle.
        </p>
        <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>
      </div>
      <p v-else-if="!isOwner && !snapshot">En attente du lancement par l'animateur.</p>
      <section class="chat" aria-label="Tchat de la salle">
        <header class="chat-header">
          <h2>Tchat</h2>
          <span v-if="connectionError" class="connection-error">{{ connectionError }}</span>
        </header>

        <div ref="chatScroll" class="chat-messages" aria-live="polite">
          <p v-if="messages.length === 0" class="chat-empty">
            Aucun message pour le moment.
          </p>
          <article v-for="message in messages" :key="message.id" class="chat-message">
            <div class="message-meta">
              <strong>{{ message.senderPseudo }}</strong>
              <time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
            </div>
            <p>{{ message.content }}</p>
          </article>
        </div>

        <form class="chat-form" @submit.prevent="sendMessage">
          <label for="chat-message" class="sr-only">Votre message</label>
          <textarea
            id="chat-message"
            v-model="draft"
            rows="2"
            maxlength="500"
            placeholder="Votre message"
          ></textarea>
          <div class="chat-actions">
            <span class="character-count">{{ draft.length }} / 500</span>
            <button type="submit">Envoyer</button>
          </div>
          <p v-if="chatError" class="chat-error" role="alert">{{ chatError }}</p>
        </form>
      </section>
    </section>
  </main>
</template>

<style scoped>
.room-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #eff6ff;
  font-family: Arial, sans-serif;
}

.room-card {
  width: min(720px, calc(100vw - 2rem));
  background: white;
  border-radius: 18px;
  padding: 2rem;
  box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  font-weight: 700;
}

h1 {
  margin: 0 0 1rem;
}

.chat {
  margin-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 1.25rem;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.chat-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.connection-error,
.chat-error {
  color: #b91c1c;
  font-size: 0.875rem;
}

.start-actions {
  margin: 1rem 0;
}

.start-button {
  border: 0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  background: #16a34a;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.start-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.start-error {
  margin: 0.5rem 0 0;
  color: #b91c1c;
  font-size: 0.875rem;
}

.chat-messages {
  height: 280px;
  overflow-y: auto;
  margin: 1rem 0;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.chat-empty {
  margin: 0.5rem 0;
  color: #64748b;
  text-align: center;
}

.chat-message {
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: white;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
}

.chat-message:last-child {
  margin-bottom: 0;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: #475569;
  font-size: 0.8rem;
}

.chat-message p {
  margin: 0.35rem 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-form textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 60px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.65rem;
  font: inherit;
}

.chat-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.character-count {
  color: #64748b;
  font-size: 0.8rem;
}

.chat-actions button {
  border: 0;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

.chat-error {
  margin: 0.5rem 0 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
