<script setup lang="ts">
import type { Answer, GameSnapshot } from '@quizz/shared';

defineProps<{
  snapshot: GameSnapshot;
  busy: boolean;
  isLastQuestion: boolean;
}>();

const emit = defineEmits<{
  lock: [];
  correct: [];
  next: [];
  validate: [playerId: string, isCorrect: boolean];
}>();

function answerValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return 'Réponse indisponible';
}

function validationClass(answer: Answer, isCorrect: boolean): { active: boolean } {
  return { active: answer.isCorrect === isCorrect };
}
</script>

<template>
  <section class="owner-controls" aria-label="Contrôles de l'animateur">
    <button
      v-if="snapshot.state === 'question_active'"
      type="button"
      :disabled="busy"
      @click="emit('lock')"
    >
      Verrouiller la question
    </button>

    <button
      v-else-if="snapshot.state === 'question_locked'"
      type="button"
      :disabled="busy"
      @click="emit('correct')"
    >
      Voir la correction
    </button>

    <template v-else-if="snapshot.state === 'correction'">
      <button
        type="button"
        :disabled="busy || snapshot.pendingManualValidation"
        @click="emit('next')"
      >
        {{ isLastQuestion ? 'Voir le classement final' : 'Question suivante' }}
      </button>
      <p v-if="snapshot.pendingManualValidation" class="validation-hint">
        Validez toutes les réponses manuelles pour continuer
      </p>

      <div
        v-if="
          snapshot.currentQuestion?.answer.mode === 'text' &&
          snapshot.currentQuestion.answer.correction === 'manual'
        "
        class="manual-answers"
      >
        <h3>Réponses à valider</h3>
        <p v-if="snapshot.currentQuestionAnswers.length === 0" class="empty-answers">
          Aucune réponse à valider.
        </p>
        <article
          v-for="answer in snapshot.currentQuestionAnswers"
          :key="answer.playerId"
          class="manual-answer"
        >
          <div class="answer-details">
            <strong>
              {{ snapshot.players.find((player) => player.id === answer.playerId)?.nickname ?? 'Pseudo indisponible dans le snapshot' }}
            </strong>
            <span>{{ answerValue(answer.value) }}</span>
          </div>
          <div class="validation-actions">
            <button
              type="button"
              :class="validationClass(answer, true)"
              :aria-pressed="answer.isCorrect === true"
              :disabled="busy"
              @click="emit('validate', answer.playerId, true)"
            >
              Correct
            </button>
            <button
              type="button"
              :class="validationClass(answer, false)"
              :aria-pressed="answer.isCorrect === false"
              :disabled="busy"
              @click="emit('validate', answer.playerId, false)"
            >
              Incorrect
            </button>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.owner-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.owner-controls > button,
.validation-actions button {
  border: 0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  background: #2563eb;
  color: white;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.owner-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.validation-hint,
.empty-answers {
  flex-basis: 100%;
  margin: 0;
  color: #475569;
}

.manual-answers {
  flex-basis: 100%;
  display: grid;
  gap: 0.75rem;
}

.manual-answers h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1rem;
}

.manual-answer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fafc;
}

.answer-details {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  overflow-wrap: anywhere;
}

.answer-details strong {
  color: #0f172a;
}

.answer-details span {
  color: #475569;
}

.validation-actions {
  display: flex;
  gap: 0.5rem;
}

.validation-actions button.active {
  background: #1e3a8a;
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
</style>
