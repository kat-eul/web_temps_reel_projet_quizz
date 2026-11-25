<template>
  <main class="home-page">
    <section class="panel">
      <div class="header-row">
        <div>
          <p class="eyebrow">Accueil</p>
          <h1>Les salles disponibles</h1>
        </div>
        <button class="primary" @click="openModal()">Créer une salle</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div class="room-list" v-if="rooms.length">
        <article v-for="room in rooms" :key="room.id" class="room-card">
          <div>
            <h2>{{ room.name }}</h2>
            <p>Propriétaire : {{ room.ownerId }}</p>
          </div>
          <div class="room-card-actions">
            <span>{{ room.nbParticipants }} / {{ room.nbMaxParticipants }}</span>
            <button
              class="primary"
              type="button"
              :disabled="joiningRoomId === room.id || room.nbParticipants >= room.nbMaxParticipants"
              @click="submitJoinRoom(room.id)"
            >
              {{ joiningRoomId === room.id ? 'Connexion...' : 'Rejoindre' }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">Aucune salle pour le moment.</p>
    </section>

    <div v-if="isModalOpen" class="modal-backdrop" @click.self="closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2>Créer une salle</h2>
          <button class="ghost" type="button" @click="closeModal()">Fermer</button>
        </div>

        <p v-if="modalError" class="modal-error">{{ modalError }}</p>

        <form @submit.prevent="submitCreateRoom" class="room-form">
          <label>
            <span>Nom de la salle</span>
            <input v-model="form.name" type="text" placeholder="Ex: Salle de Maths" minlength="3" maxlength="50" required />
          </label>

          <label>
            <span>Nombre maximum de participants</span>
            <input v-model="form.nbMaxParticipants" type="number" min="2" max="50" required />
          </label>

          <label>
            <span>Quiz (YAML)</span>
            <textarea v-model="form.quizYaml" rows="12" required placeholder="quiz:&#10;  title: Mon quiz&#10;questions:&#10;  - title: ..."></textarea>
          </label>

          <div class="actions">
            <button type="button" class="secondary" @click="closeModal()">Annuler</button>
            <button type="submit" class="primary" :disabled="loading">
              {{ loading ? 'Création...' : 'Valider' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f3f6fb;
  padding: 2rem;
  font-family: Arial, sans-serif;
}

.panel {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 18px;
  padding: 2rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #4f46e5;
  font-size: 0.75rem;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: #111827;
}

.primary,
.secondary,
.ghost {
  border: none;
  border-radius: 10px;
  padding: 0.8rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: white;
}

.secondary {
  background: #e5e7eb;
  color: #111827;
}

.ghost {
  background: transparent;
  color: #374151;
}

.room-list {
  display: grid;
  gap: 1rem;
}

.room-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem 1.2rem;
}

.room-card h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.room-card-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.room-card p,
.empty-state {
  margin: 0;
  color: #6b7280;
}

.error-box {
  margin-bottom: 1rem;
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  white-space: pre-line;
}

.modal-error {
  margin: 0;
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.9rem;
  white-space: pre-line;
  max-height: 180px;
  overflow-y: auto;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: grid;
  place-items: center;
  padding: 1rem;
}

.modal {
  width: min(480px, 100%);
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h2 {
  margin: 0;
}

.room-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-weight: 600;
  color: #374151;
}

input,
select {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  font-size: 1rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

button:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiValidationError, createRoom, joinRoom, listRooms, pollRooms } from '../services/room';
import type { Room } from '@quizz/shared';

const router = useRouter();
const rooms = ref<Room[]>([]);
const loading = ref(false);
const joiningRoomId = ref<number | null>(null);
const error = ref('');
const isModalOpen = ref(false);
let roomsVersion = 0;
let pollingController: AbortController | null = null;
let polling = false;
let active = true;
const modalError = ref('');

const form = reactive({
  name: '',
  nbMaxParticipants: 8,
  quizYaml: '',
});

async function fetchData() {
  try {
    rooms.value = await listRooms();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de charger les salles.';
  }
}
async function startRoomPolling() {
  if (polling) return;
  polling = true;

  pollingController = new AbortController();
  while (active) {
    try {
      const result = await pollRooms(roomsVersion, pollingController.signal);
      rooms.value = result.rooms;
      roomsVersion = result.version;
    } catch (err) {
      if (!active || (err instanceof DOMException && err.name === 'AbortError')) {
        break;
      }
      error.value = err instanceof Error
        ? err.message
        : 'Impossible de surveiller les salles.';
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  polling = false;
}

async function submitCreateRoom() {
  try {
    loading.value = true;
    modalError.value = '';

    const room = await createRoom({
      name: form.name,
      nbMaxParticipants: Number(form.nbMaxParticipants),
      quizYaml: form.quizYaml,
    });

    closeModal();
    await router.push({ name: 'room', params: { id: String(room.id) } });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      modalError.value = [err.message, ...err.issues].join('\n');
    } else {
      modalError.value = err instanceof Error ? err.message : 'Impossible de créer la salle.';
    }
  } finally {
    loading.value = false;
  }
}

async function submitJoinRoom(roomId: number) {
  try {
    joiningRoomId.value = roomId;
    error.value = '';

    await joinRoom(roomId);
    await router.push({ name: 'room', params: { id: String(roomId) } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de rejoindre la salle.';
  } finally {
    joiningRoomId.value = null;
  }
}

function openModal() {
  modalError.value = '';
  isModalOpen.value = true;
}

function closeModal() {
  modalError.value = '';
  isModalOpen.value = false;
}

onMounted(() => {
  void fetchData();
  void startRoomPolling();
});

onBeforeUnmount(() => {
  active = false;
  pollingController?.abort();
});
</script>
