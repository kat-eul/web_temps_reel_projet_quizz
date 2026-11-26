<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Question } from '@quizz/shared';

type AnswerValue = boolean | string | string[] | number;

const props = defineProps<{
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  disabled: boolean;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: AnswerValue];
}>();

const selectedOptions = ref<string[]>([]);
const textValue = ref('');
const numberValue = ref('');

const youtubeEmbedUrl = computed(() => {
  const media = props.question.media;
  if (media?.type !== 'youtube') return '';

  try {
    const url = new URL(media.url);
    const videoId =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.searchParams.get('v') ??
          url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (!videoId) return '';

    const embedUrl = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
    if (media.clip?.start !== undefined) {
      embedUrl.searchParams.set('start', String(media.clip.start));
    }
    return embedUrl.toString();
  } catch {
    return '';
  }
});

function submitText() {
  emit('submit', textValue.value.trim());
}

function submitNumber() {
  emit('submit', Number(numberValue.value));
}

function submitMultipleChoice() {
  emit('submit', [...selectedOptions.value]);
}
</script>

<template>
  <section class="question-card">
    <p class="question-count">Question {{ questionIndex }} / {{ totalQuestions }}</p>
    <h2>{{ question.title }}</h2>

    <div v-if="question.media" class="question-media">
      <img
        v-if="question.media.type === 'image'"
        :src="question.media.url"
        :alt="question.title"
      />
      <iframe
        v-else-if="question.media.type === 'youtube' && youtubeEmbedUrl"
        :src="youtubeEmbedUrl"
        :title="question.title"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
      <audio
        v-else-if="question.media.type === 'audio'"
        :src="question.media.url"
        controls
      ></audio>
    </div>

    <div v-if="!readOnly" class="answer-form">
      <div v-if="question.answer.mode === 'boolean'" class="answer-options">
        <button
          type="button"
          :disabled="disabled"
          @click="emit('submit', true)"
        >
          Vrai
        </button>
        <button
          type="button"
          :disabled="disabled"
          @click="emit('submit', false)"
        >
          Faux
        </button>
      </div>

      <div
        v-else-if="question.answer.mode === 'choice' && !question.answer.multiple"
        class="answer-options"
      >
        <button
          v-for="(option, index) in question.answer.options"
          :key="index"
          type="button"
          :disabled="disabled"
          @click="emit('submit', [option.text])"
        >
          {{ option.text }}
        </button>
      </div>

      <form
        v-else-if="question.answer.mode === 'choice' && question.answer.multiple"
        class="answer-options"
        @submit.prevent="submitMultipleChoice"
      >
        <label v-for="(option, index) in question.answer.options" :key="index" class="checkbox-option">
          <input
            v-model="selectedOptions"
            type="checkbox"
            :value="option.text"
            :disabled="disabled"
          />
          {{ option.text }}
        </label>
        <button type="submit" :disabled="disabled || selectedOptions.length === 0">
          Valider
        </button>
      </form>

      <form
        v-else-if="question.answer.mode === 'text'"
        class="answer-options"
        @submit.prevent="submitText"
      >
        <label for="text-answer">Votre réponse</label>
        <input
          id="text-answer"
          v-model="textValue"
          type="text"
          :disabled="disabled"
        />
        <button type="submit" :disabled="disabled || textValue.trim().length === 0">
          Valider
        </button>
      </form>

      <form
        v-else-if="question.answer.mode === 'number'"
        class="answer-options"
        @submit.prevent="submitNumber"
      >
        <label for="number-answer">Votre réponse</label>
        <input
          id="number-answer"
          v-model="numberValue"
          type="number"
          :min="question.answer.range.min"
          :max="question.answer.range.max"
          step="any"
          required
          :disabled="disabled"
        />
        <button type="submit" :disabled="disabled">Valider</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.question-card {
  margin: 1.5rem 0;
  padding: 1.25rem;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #f8fafc;
}

.question-count {
  margin: 0 0 0.5rem;
  color: #2563eb;
  font-size: 0.85rem;
  font-weight: 700;
}

h2 {
  margin: 0 0 1rem;
  color: #0f172a;
}

.question-media {
  margin: 1rem 0;
}

.question-media img,
.question-media iframe {
  display: block;
  width: 100%;
  max-height: 420px;
  border: 0;
  border-radius: 10px;
  object-fit: contain;
}

.question-media iframe {
  aspect-ratio: 16 / 9;
}

.question-media audio {
  width: 100%;
}

.answer-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.answer-options label:not(.checkbox-option) {
  flex-basis: 100%;
  color: #334155;
}

.answer-options input[type='text'],
.answer-options input[type='number'] {
  flex: 1 1 14rem;
  min-width: 0;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.65rem;
  font: inherit;
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-basis: 100%;
  color: #334155;
}

.answer-options button {
  border: 0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  background: #2563eb;
  color: white;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.answer-options button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
