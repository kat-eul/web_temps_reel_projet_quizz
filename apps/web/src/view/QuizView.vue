<script setup lang="ts">
import { onMounted, ref } from 'vue';

const quiz = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await fetch('http://localhost:3000/api/quizz/1');
    if (!response.ok) {
      throw new Error('Impossible de charger le quiz.');
    }
    quiz.value = await response.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Erreur inconnue';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main>
    <p v-if="loading">Chargement...</p>
    <p v-else-if="error">{{ error }}</p>
    <pre v-else-if="quiz">{{ JSON.stringify(quiz, null, 2) }}</pre>
  </main>
</template>

<style scoped>
main {
  padding: 24px;
  font-family: Arial, sans-serif;
}

pre {
  background: #f6f6f6;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}
</style>

