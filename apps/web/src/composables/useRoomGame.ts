import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { GameEndedPayload, GameSnapshot, HostStatusPayload } from '@quizz/shared';
import type { Socket } from 'socket.io-client';

export function useRoomGame(socket: Ref<Socket | null>) {
  const snapshot = ref<GameSnapshot | null>(null);
  const hostConnected = ref(true);
  const ended = ref<GameEndedPayload | null>(null);

  const leaderboard = computed(() =>
    snapshot.value ? [...snapshot.value.players].sort((a, b) => b.score - a.score) : [],
  );

  function reset() {
    snapshot.value = null;
    ended.value = null;
    hostConnected.value = true;
  }

  watch(
    socket,
    (s, _old, onCleanup) => {
      if (!s) return;

      const handleSnapshot = (value: GameSnapshot) => {
        snapshot.value = value;
      };
      const handleHostStatus = (value: HostStatusPayload) => {
        hostConnected.value = value.connected;
      };
      const handleEnded = (value: GameEndedPayload) => {
        ended.value = value;
      };

      s.on('game:snapshot', handleSnapshot);
      s.on('game:host-status', handleHostStatus);
      s.on('game:ended', handleEnded);

      onCleanup(() => {
        s.off('game:snapshot', handleSnapshot);
        s.off('game:host-status', handleHostStatus);
        s.off('game:ended', handleEnded);
      });
    },
    { immediate: true, flush: 'sync' },
  );

  return { snapshot, hostConnected, ended, leaderboard, reset };
}
