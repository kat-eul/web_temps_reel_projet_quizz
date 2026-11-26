<script setup lang="ts">
defineProps<{
  ranking: { nickname: string; score: number }[];
  myNickname?: string;
  title: string;
}>();
</script>

<template>
  <section class="final-ranking">
    <h2>{{ title }}</h2>
    <p v-if="ranking.length === 0" class="empty-ranking">
      Aucun joueur n'a participé.
    </p>
    <ol v-else>
      <li
        v-for="(player, index) in ranking"
        :key="`${player.nickname}-${index}`"
        :class="{ 'my-ranking': player.nickname === myNickname }"
      >
        <span>{{ index + 1 }}. {{ player.nickname }}</span>
        <strong>{{ player.score }}</strong>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.final-ranking {
  color: #0f172a;
}

.final-ranking h2 {
  margin: 0 0 1rem;
  color: #0f172a;
}

.final-ranking ol {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.final-ranking li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: #f8fafc;
  color: #0f172a;
}

.final-ranking li.my-ranking {
  background: #fde68a;
}

.empty-ranking {
  margin: 0;
  color: #0f172a;
}
</style>
