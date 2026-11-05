import { ref, shallowRef, watch, type Ref } from 'vue';

// Вызывать синхронно в setup компонента или внутри effectScope().run().
export function useLatestSearch<T>(
  query: Ref<string>,
  load: (query: string, signal: AbortSignal) => Promise<T[]>,
) {
  const results = shallowRef<T[]>([]);
  const error = ref<string | null>(null);
  const isLoading = ref(false);

  watch(query, async (rawQuery, _previous, onCleanup) => {
    const controller = new AbortController();
    let active = true;
    onCleanup(() => {
      active = false;
      controller.abort();
    });
    // Значение могло измениться до следующего запуска watch.
    const isCurrent = () => active && query.value === rawQuery;

    results.value = [];
    error.value = null;
    const text = rawQuery.trim();
    isLoading.value = text.length > 0;
    if (!text) return;

    try {
      const items = await load(text, controller.signal);
      if (isCurrent()) results.value = items;
    } catch (cause) {
      if (isCurrent()) {
        error.value = cause instanceof Error ? cause.message : 'Не удалось выполнить поиск';
      }
    } finally {
      if (isCurrent()) isLoading.value = false;
    }
  }, { immediate: true });

  return { results, error, isLoading };
}
