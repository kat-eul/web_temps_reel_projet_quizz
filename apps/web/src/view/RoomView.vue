<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ChatMessage, Room, RoomClosedPayload } from '@quizz/shared';
import { io, type Socket } from 'socket.io-client';
import { getStoredSession } from '../services/auth';
import { useRoomGame } from '../composables/useRoomGame';
import QuestionCard from '../components/game/QuestionCard.vue';
import OwnerControls from '../components/game/OwnerControls.vue';
import CorrectionView from '../components/game/CorrectionView.vue';
import HostStatusBanner from '../components/game/HostStatusBanner.vue';
import FinalRanking from '../components/game/FinalRanking.vue';
import QuitConfirmModal from '../components/game/QuitConfirmModal.vue';

const route = useRoute();
const router = useRouter();
const room = ref<Room | null>(null);
const socket = shallowRef<Socket | null>(null);
const currentUser = getStoredSession();
const { snapshot, hostConnected, ended, leaderboard, hasAnswered, answeredCount, connectedPlayerCount } = useRoomGame(socket);
const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const chatError = ref('');
const connectionError = ref('');
const chatScroll = ref<HTMLElement | null>(null);
const starting = ref(false);
const startError = ref('');
const answerSubmitting = ref(false);
const answerError = ref('');
const ownerActionBusy = ref(false);
const ownerActionError = ref('');
const showQuitModal = ref(false);
const quitBusy = ref(false);
const quitError = ref('');
const closedMessage = ref('');
let closedRedirectTimeout: ReturnType<typeof setTimeout> | null = null;
const myId = String(currentUser?.user?.id ?? '');
const alreadyAnswered = computed(() => hasAnswered(myId));
const isOwner = computed(() => !!room.value && room.value.ownerId === currentUser?.user?.id);
const myPlayer = computed(() => snapshot.value?.players.find((player) => player.id === myId));
const finalRanking = computed(() =>
  leaderboard.value.map(({ nickname, score }) => ({ nickname, score })),
);
const isLastQuestion = computed(
  () =>
    !!snapshot.value &&
    snapshot.value.currentQuestionIndex === snapshot.value.totalQuestions - 1,
);
const canStart = computed(
  () =>
    isOwner.value &&
    !snapshot.value &&
    room.value?.state === 'WAITING' &&
    (room.value?.nbParticipants ?? 0) >= 2,
);

watch(
  alreadyAnswered,
  (answered) => {
    if (answered) answerSubmitting.value = false;
  },
  { immediate: true },
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
    socket.value.on('room:closed', (_payload: RoomClosedPayload) => {
      const wasOwner = isOwner.value;
      room.value = null;
      showQuitModal.value = false;
      quitBusy.value = false;
      if (wasOwner) {
        void router.push('/home');
        return;
      }
      closedMessage.value = "L'animateur a quitté la salle. Vous allez être redirigé vers l'accueil.";
      closedRedirectTimeout = setTimeout(() => {
        void router.push('/home');
      }, 3000);
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
  if (closedRedirectTimeout) clearTimeout(closedRedirectTimeout);
  if (!socket.value) return;
  if (room.value) socket.value.emit('room:leave', { roomId: room.value.id });
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

function submitAnswer(value: boolean | string | string[] | number) {
  if (!socket.value || !room.value || answerSubmitting.value || alreadyAnswered.value) return;

  answerSubmitting.value = true;
  answerError.value = '';
  socket.value.emit(
    'room:answer',
    { roomId: room.value.id, value },
    (response: { accepted: boolean; reason?: string }) => {
      if (response.accepted) return;
      answerError.value = response.reason ?? 'Impossible d’envoyer votre réponse.';
      answerSubmitting.value = false;
    },
  );
}

function sendOwnerAction(
  event: 'room:lock' | 'room:correct' | 'room:next' | 'room:validate',
  extra: { playerId: string; isCorrect: boolean } | undefined = undefined,
) {
  if (!socket.value?.connected || !room.value || ownerActionBusy.value) {
    ownerActionError.value = 'Connexion indisponible pour effectuer cette action.';
    return;
  }

  ownerActionBusy.value = true;
  ownerActionError.value = '';
  const timeoutId = setTimeout(() => {
    ownerActionBusy.value = false;
    ownerActionError.value = 'Pas de réponse du serveur, réessayez.';
  }, 5000);
  socket.value.emit(
    event,
    { roomId: room.value.id, ...extra },
    (response: { ok: boolean; reason?: string; error?: string }) => {
      clearTimeout(timeoutId);
      ownerActionBusy.value = false;
      if (!response.ok) {
        ownerActionError.value =
          response.reason ?? response.error ?? "Impossible d'effectuer cette action.";
      }
    },
  );
}

function lockQuestion() {
  sendOwnerAction('room:lock');
}

function enterCorrection() {
  sendOwnerAction('room:correct');
}

function nextQuestion() {
  sendOwnerAction('room:next');
}

function validateAnswer(playerId: string, isCorrect: boolean) {
  sendOwnerAction('room:validate', { playerId, isCorrect });
}

function quitRoom() {
  if (!socket.value || !room.value || quitBusy.value) return;

  quitBusy.value = true;
  quitError.value = '';
  socket.value.emit(
    isOwner.value ? 'room:close' : 'room:quit',
    { roomId: room.value.id },
    (response: { ok: boolean; error?: string; reason?: string }) => {
      quitBusy.value = false;
      if (!response.ok) {
        quitError.value = response.reason ?? response.error ?? 'Impossible de quitter la salle.';
        return;
      }
      if (!isOwner.value) {
        void router.push('/home');
      }
    },
  );
}
</script>

<template>
  <main class="room-page">
    <p v-if="closedMessage" class="closed-message" role="status">{{ closedMessage }}</p>
    <section class="room-card" v-if="room">
      <HostStatusBanner v-if="!isOwner" :connected="hostConnected" />
      <div class="room-heading">
        <div>
          <p class="eyebrow">Salle créée</p>
          <h1>{{ room.name }}</h1>
        </div>
        <button class="quit-button" type="button" @click="showQuitModal = true">
          {{ isOwner ? 'Fermer la salle' : 'Quitter la salle' }}
        </button>
      </div>
      <p v-if="quitError" class="quit-error" role="alert">{{ quitError }}</p>
      <p>Joueurs : {{ Math.max(room.nbParticipants - 1, 0) }} / {{ room.nbMaxParticipants - 1 }}</p>
      <div v-if="!snapshot">
        <div v-if="isOwner" class="start-actions">
          <button class="start-button" type="button" :disabled="!canStart || starting" @click="startGame">
            {{ starting ? 'Lancement...' : 'Lancer la partie' }}
          </button>
          <p v-if="room.nbParticipants < 2" class="start-hint">
            Au moins un joueur doit avoir rejoint la salle.
          </p>
          <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>
        </div>
        <p v-else>En attente du lancement par l'animateur.</p>
      </div>
      <section
        v-if="snapshot?.state === 'question_active' && snapshot.currentQuestion"
        class="game-question"
      >
        <QuestionCard
          :question="snapshot.currentQuestion"
          :question-index="snapshot.currentQuestionIndex + 1"
          :total-questions="snapshot.totalQuestions"
          :disabled="isOwner || alreadyAnswered || answerSubmitting"
          :read-only="isOwner"
          @submit="submitAnswer"
        />
        <div v-if="isOwner" class="owner-active-actions">
          <p class="answer-progress">
            {{ answeredCount }} / {{ connectedPlayerCount }} ont répondu
          </p>
          <OwnerControls
            :snapshot="snapshot"
            :busy="ownerActionBusy"
            :is-last-question="isLastQuestion"
            @lock="lockQuestion"
            @correct="enterCorrection"
            @next="nextQuestion"
            @validate="validateAnswer"
          />
        </div>
        <p v-if="isOwner && ownerActionError" class="answer-error" role="alert">
          {{ ownerActionError }}
        </p>
        <p v-if="!isOwner && alreadyAnswered" class="answer-sent">
          Réponse envoyée, en attente des autres joueurs.
        </p>
        <p v-if="answerError" class="answer-error" role="alert">{{ answerError }}</p>
      </section>
      <section v-if="snapshot?.state === 'question_locked'" class="game-question">
        <OwnerControls
          v-if="isOwner"
          :snapshot="snapshot"
          :busy="ownerActionBusy"
          :is-last-question="isLastQuestion"
          @lock="lockQuestion"
          @correct="enterCorrection"
          @next="nextQuestion"
          @validate="validateAnswer"
        />
        <p v-else>Question verrouillée, correction en cours…</p>
        <p v-if="ownerActionError" class="answer-error" role="alert">{{ ownerActionError }}</p>
      </section>
      <section v-if="snapshot?.state === 'correction'" class="game-question">
        <template v-if="isOwner">
          <OwnerControls
            :snapshot="snapshot"
            :busy="ownerActionBusy"
            :is-last-question="isLastQuestion"
            @lock="lockQuestion"
            @correct="enterCorrection"
            @next="nextQuestion"
            @validate="validateAnswer"
          />
          <p v-if="!snapshot.currentQuestion" class="answer-error" role="alert">
            Question indisponible dans le snapshot.
          </p>
        </template>
        <template v-else-if="snapshot.currentQuestion && myPlayer">
          <CorrectionView
            :question="snapshot.currentQuestion"
            :my-answer="snapshot.currentQuestionAnswers.find((answer) => answer.playerId === myId)"
            :my-score="myPlayer.score"
          />
        </template>
        <p v-else class="answer-error" role="alert">
          {{ snapshot.currentQuestion ? 'Joueur indisponible dans le snapshot.' : 'Question indisponible dans le snapshot.' }}
        </p>
        <p v-if="ownerActionError" class="answer-error" role="alert">{{ ownerActionError }}</p>
      </section>
      <section v-if="snapshot?.state === 'finished'" class="game-question">
        <FinalRanking
          v-if="isOwner"
          :ranking="finalRanking"
          title="Classement final"
        />
        <FinalRanking
          v-else
          :ranking="ended?.ranking ?? finalRanking"
          :my-nickname="myPlayer?.nickname"
          title="Partie terminée"
        />
      </section>
      <section
        v-if="!snapshot || snapshot.state === 'finished'"
        class="chat"
        aria-label="Tchat de la salle"
      >
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
    <QuitConfirmModal
      :open="showQuitModal"
      :is-owner="isOwner"
      :busy="quitBusy"
      @confirm="quitRoom"
      @cancel="showQuitModal = false"
    />
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
  position: relative;
  width: min(720px, calc(100vw - 2rem));
  background: white;
  border-radius: 18px;
  padding: 2rem;
  box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
}

.room-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.room-heading h1 {
  margin: 0 0 1rem;
}

.quit-button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  padding: 0.65rem 0.9rem;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
  cursor: pointer;
}

.quit-error,
.closed-message {
  color: #b91c1c;
  font-size: 0.9rem;
}

.closed-message {
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: white;
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
  background: #2563eb;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.start-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.start-error {
  margin: 0.5rem 0 0;
  color: #b91c1c;
  font-size: 0.875rem;
}

.game-question {
  margin-top: 1.5rem;
}

.owner-active-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.answer-progress,
.answer-sent {
  color: #475569;
  font-weight: 700;
}

.answer-progress {
  margin: 0;
}

.answer-error {
  color: #b91c1c;
  font-size: 0.875rem;
}

.game-finished {
  margin-top: 1.5rem;
  color: #0f172a;
  font-weight: 700;
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
