<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Room } from '@quizz/shared';

const route = useRoute();
const room = ref<Room | null>(null);

onMounted(async () => {
  const roomId = Number(route.params.id);
  const response = await fetch(`http://localhost:3000/api/rooms/${roomId}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Salle introuvable.');
  }

  room.value = payload;
});
</script>

<template>
  <main class="room-page">
    <section class="room-card" v-if="room">
      <p class="eyebrow">Salle créée</p>
      <h1>{{ room.name }}</h1>
      <p>Quiz sélectionné : n°{{ room.quizId }}</p>
      <p>Capacité maximale : {{ room.nbParticipants }} participants</p>
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
  width: min(520px, calc(100vw - 2rem));
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
</style>
