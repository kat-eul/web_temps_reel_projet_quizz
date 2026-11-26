<script setup lang="ts">
import { computed } from 'vue';
import type { Answer, Question } from '@quizz/shared';

const props = defineProps<{
  question: Question;
  myAnswer: Answer | undefined;
  myScore: number;
}>();

const correctAnswer = computed(() => {
  const answer = props.question.answer;

  if (answer.mode === 'boolean') return answer.value ? 'Vrai' : 'Faux';
  if (answer.mode === 'choice') {
    return answer.options
      .filter((option) => option.correct)
      .map((option) => option.text)
      .join(', ');
  }
  if (answer.mode === 'text') {
    if (answer.correction === 'manual') return "Jugée par l'animateur";
    return answer.accepted?.join(' / ') || 'Réponse acceptée indisponible.';
  }
  return `${answer.value} ± ${answer.tolerance}`;
});

const result = computed(() => {
  if (!props.myAnswer) return "Vous n'avez pas répondu.";
  if (props.myAnswer?.isCorrect === true) return 'Bonne réponse !';
  if (props.myAnswer?.isCorrect === false) return "Ce n'était pas ça.";
  return 'En attente de validation.';
});
</script>

<template>
  <section class="correction-view" aria-label="Correction de la question">
    <h2>Correction</h2>
    <p class="correct-answer">
      <strong>Bonne réponse :</strong> {{ correctAnswer }}
    </p>
    <p class="player-result">{{ result }}</p>
    <p class="player-score"><strong>Votre score :</strong> {{ myScore }}</p>
  </section>
</template>

<style scoped>
.correction-view {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #f8fafc;
}

h2 {
  margin: 0 0 1rem;
  color: #0f172a;
}

.correct-answer,
.player-result,
.player-score {
  margin: 0.75rem 0 0;
  color: #334155;
}

.player-result {
  color: #1e3a8a;
  font-weight: 700;
}
</style>
