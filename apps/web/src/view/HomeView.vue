<template>
  <main class="home-page">
    <section class="panel">
      <div class="header-row">
        <div>
          <p class="eyebrow">Accueil</p>
          <h1>Les salles disponibles</h1>
        </div>
        <button class="primary" @click="isModalOpen = true">Créer une salle</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div class="room-list" v-if="rooms.length">
        <article v-for="room in rooms" :key="room.id" class="room-card">
          <div>
            <h2>{{ room.name }}</h2>
            <p>Quiz n°{{ room.quizId }}</p>
          </div>
          <span>{{ room.nbParticipants }} max</span>
        </article>
      </div>
      <p v-else class="empty-state">Aucune salle pour le moment.</p>
    </section>

    <div v-if="isModalOpen" class="modal-backdrop" @click.self="isModalOpen = false">
      <div class="modal">
        <div class="modal-header">
          <h2>Créer une salle</h2>
          <button class="ghost" type="button" @click="isModalOpen = false">Fermer</button>
        </div>

        <form @submit.prevent="submitCreateRoom" class="room-form">
          <label>
            <span>Nom de la salle</span>
            <input v-model="form.name" type="text" placeholder="Ex: Salle de Maths" minlength="3" maxlength="50" required />
          </label>

          <label>
            <span>Nombre maximum de participants</span>
            <input v-model="form.nbParticipants" type="number" min="2" max="50" required />
          </label>

          <label>
            <span>Quiz</span>
            <select v-model="form.quizId" required>
              <option v-for="quiz in quizzes" :key="quiz.id" :value="quiz.id">
                {{ quiz.title }}
              </option>
            </select>
          </label>

          <div class="actions">
            <button type="button" class="secondary" @click="isModalOpen = false">Annuler</button>
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
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { listQuizzes } from '../services/quiz';
import { createRoom, listRooms } from '../services/room';
import type { Quiz, Room } from '@quizz/shared';

const router = useRouter();
const rooms = ref<Room[]>([]);
const quizzes = ref<Quiz[]>([]);
const loading = ref(false);
const error = ref('');
const isModalOpen = ref(false);
const form = reactive({
  name: '',
  nbParticipants: 8,
  quizId: 1,
});

async function fetchData() {
  try {
    const [quizzesList, roomsList] = await Promise.all([listQuizzes(), listRooms()]);
    quizzes.value = quizzesList;
    rooms.value = roomsList;
    if (quizzesList.length && !form.quizId) {
      form.quizId = quizzesList[0].id;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de charger les données.';
  }
}

async function submitCreateRoom() {
  try {
    loading.value = true;
    error.value = '';

    const room = await createRoom({
      name: form.name,
      nbParticipants: Number(form.nbParticipants),
      quizId: Number(form.quizId),
    });

    isModalOpen.value = false;
    await router.push({ name: 'room', params: { id: String(room.id) } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Impossible de créer la salle.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchData();
});
</script>
