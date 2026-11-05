import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, watch, type EffectScope } from 'vue';
import { useLatestSearch } from './useLatestSearch';
import { searchUsers } from './searchUsers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});

function setup(abortRejects = false) {
  const requests: Array<ReturnType<typeof deferred<string[]>> & { signal: AbortSignal; query: string }> = [];
  const query = ref('alpha');
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() => useLatestSearch(query, (text, signal) => {
    const request = { ...deferred<string[]>(), signal, query: text };
    requests.push(request);
    if (abortRejects) signal.addEventListener('abort', () => {
      request.reject(new DOMException('Отменено', 'AbortError'));
    }, { once: true });
    return request.promise;
  }))!;
  return { query, scope, state, requests };
}

describe('Только актуальный поиск меняет состояние', () => {
  it('поздний успех A не перезаписывает результат B, даже если загрузчик игнорирует отмену', async () => {
    const { query, state, requests } = setup();
    query.value = 'beta';
    await nextTick();
    expect(requests[0].signal.aborted).toBe(true);
    requests[1].resolve(['B']);
    await nextTick();
    requests[0].resolve(['A']);
    await nextTick();
    expect(state.results.value).toEqual(['B']);
    expect(state.error.value).toBeNull();
    expect(state.isLoading.value).toBe(false);
  });

  it('AbortError и finally старого A не выключают загрузку B', async () => {
    const { query, state } = setup(true);
    query.value = 'beta';
    await nextTick();
    await nextTick();
    expect(state.isLoading.value).toBe(true);
    expect(state.error.value).toBeNull();
  });

  it('поздняя ошибка A не становится ошибкой B', async () => {
    const { query, state, requests } = setup();
    query.value = 'beta';
    await nextTick();
    requests[0].reject(new Error('Ошибка A'));
    await nextTick();
    expect(state.error.value).toBeNull();
    expect(state.isLoading.value).toBe(true);
  });

  it('показывает ошибку актуального запроса и сбрасывает ее при новом поиске', async () => {
    const { query, state, requests } = setup();
    requests[0].reject(new Error('Сеть недоступна'));
    await nextTick();
    expect(state.error.value).toBe('Сеть недоступна');
    expect(state.isLoading.value).toBe(false);
    query.value = 'beta';
    await nextTick();
    expect(state.error.value).toBeNull();
    expect(state.isLoading.value).toBe(true);
  });

  it('очищает поиск при пустом вводе и не принимает поздний результат', async () => {
    const { query, state, requests } = setup();
    query.value = '  ';
    await nextTick();
    requests[0].resolve(['A']);
    await nextTick();
    expect(requests).toHaveLength(1);
    expect(state.results.value).toEqual([]);
    expect(state.isLoading.value).toBe(false);
  });

  it('после остановки области отменяет запрос и больше не меняет состояние', async () => {
    const { scope, state, requests } = setup();
    scope.stop();
    const before = { results: state.results.value, loading: state.isLoading.value };
    requests[0].resolve(['A']);
    await nextTick();
    expect(requests[0].signal.aborted).toBe(true);
    expect(state.results.value).toBe(before.results);
    expect(state.isLoading.value).toBe(before.loading);
  });

  it('не принимает A, если ввод изменен, а новый watch еще не запущен', async () => {
    const { query, scope, state, requests } = setup();
    const observed: string[][] = [];
    scope.run(() => watch(state.results, (items) => {
      observed.push([...items]);
    }, { flush: 'sync' }));
    requests[0].resolve(['A']);
    query.value = 'beta';
    await nextTick();
    expect(observed).not.toContainEqual(['A']);
    expect(state.results.value).toEqual([]);
    expect(state.isLoading.value).toBe(true);
  });
});

describe('Граница HTTP и JSON', () => {
  it('кодирует запрос и возвращает проверенные данные', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: '1', name: 'Анна' }])));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await searchUsers('a&b', signal)).toEqual([{ id: '1', name: 'Анна' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=a%26b', { signal });
  });

  it('считает HTTP 500 ошибкой, хотя fetch сам не отклоняет Promise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ошибка', { status: 500 })));
    await expect(searchUsers('a', new AbortController().signal)).rejects.toThrow('Ошибка HTTP: 500');
  });

  it.each([{ id: 42, name: null }, { id: '1' }, null])('отклоняет неверный элемент %j', async (item) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([item]))));
    await expect(searchUsers('a', new AbortController().signal)).rejects.toThrow('неверный список');
  });
});
