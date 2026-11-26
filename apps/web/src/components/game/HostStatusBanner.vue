<script setup lang="ts">
defineProps<{
  connected: boolean;
}>();
</script>

<template>
  <div v-if="!connected" class="host-status-banner" role="status">
    L'animateur est déconnecté. Attendez son retour.
  </div>
</template>

<style scoped>
.host-status-banner {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: #fef3c7;
  color: #92400e;
}
</style>
