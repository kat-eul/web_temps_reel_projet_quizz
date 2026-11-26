<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  isOwner: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('cancel');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleKeydown);
    } else {
      window.removeEventListener('keydown', handleKeydown);
    }
  },
);

onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div
    v-if="open"
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="'quit-modal-title'"
    @click.self="emit('cancel')"
  >
    <section class="modal-card">
      <h2 id="quit-modal-title">{{ isOwner ? 'Fermer la salle ?' : 'Quitter la salle ?' }}</h2>
      <p>
        {{
          isOwner
            ? "La salle sera supprimée et tous les joueurs seront renvoyés à l'accueil."
            : 'Vous ne pourrez pas revenir dans cette partie.'
        }}
      </p>
      <div class="modal-actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">Annuler</button>
        <button class="confirm-button" type="button" :disabled="busy" @click="emit('confirm')">
          {{ isOwner ? 'Fermer la salle' : 'Quitter' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.55);
}

.modal-card {
  width: min(440px, 100%);
  box-sizing: border-box;
  padding: 1.5rem;
  border-radius: 16px;
  background: white;
  box-shadow: 0 18px 35px rgba(15, 23, 42, 0.2);
}

.modal-card h2 {
  margin: 0 0 0.75rem;
}

.modal-card p {
  margin: 0;
  color: #475569;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.modal-actions button {
  border: 0;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  background: #e2e8f0;
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.modal-actions .confirm-button {
  background: #dc2626;
  color: white;
}

.modal-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
</style>
