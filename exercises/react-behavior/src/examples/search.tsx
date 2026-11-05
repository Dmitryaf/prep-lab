// checked-example: react-search
import { useEffect, useState } from 'react';

export type User = { id: string; name: string };
export type Loader = (orgId: string, term: string, options: { signal: AbortSignal }) => Promise<User[]>;
type SearchResult = { key: string | null; status: 'idle' | 'loading' | 'success' | 'error'; users: User[]; error: unknown };

function emptySearch(key: string | null, status: SearchResult['status']): SearchResult {
  return { key, status, users: [], error: null };
}

function useUserSearch(orgId: string, query: string, loadUsers: Loader, delay = 300) {
  const term = query.trim();
  const key = JSON.stringify([orgId, term]);
  const [result, setResult] = useState(() => emptySearch(null, 'idle'));

  useEffect(() => {
    if (!term) return;
    let active = true;
    const controller = new AbortController();
    setResult(emptySearch(key, 'loading'));
    const timer = setTimeout(async () => {
      try {
        const users = await loadUsers(orgId, term, { signal: controller.signal });
        if (active) setResult({ key, status: 'success', users, error: null });
      } catch (error) {
        if (active) setResult({ ...emptySearch(key, 'error'), error });
      }
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [orgId, term, key, loadUsers, delay]);

  if (!term) return emptySearch(key, 'idle');
  return result.key === key ? result : emptySearch(key, 'loading');
}

// Учебный HTTP-контракт: GET /api/users?org=...&q=... -> массив пользователей.
const loadUsersFromApi: Loader = async (orgId, term, { signal }) => {
  const params = new URLSearchParams({ org: orgId, q: term });
  const response = await fetch(`/api/users?${params}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const users: unknown = await response.json();
  if (!Array.isArray(users) || !users.every(user =>
    user !== null && typeof user === 'object'
    && typeof user.id === 'string' && typeof user.name === 'string'
  ) || new Set(users.map(user => user.id)).size !== users.length) {
    throw new Error('Invalid users response');
  }
  return users;
}

function UserSearch({ orgId, query, onQueryChange, onSelect,
  loadUsers = loadUsersFromApi, delay = 300 }: {
    orgId: string; query: string; onQueryChange: (value: string) => void;
    onSelect: (id: string) => void; loadUsers?: Loader; delay?: number;
  }) {
  const result = useUserSearch(orgId, query, loadUsers, delay);
  return <section>
    <label>Поиск пользователей
      <input type="search" value={query}
        onChange={event => onQueryChange(event.target.value)} />
    </label>
    {result.status === 'loading' && <p role="status">Загрузка…</p>}
    {result.status === 'error' && <p role="alert">Не удалось загрузить пользователей.</p>}
    {result.status === 'success' && result.users.length === 0
      && <p role="status">Ничего не найдено.</p>}
    <ul>{result.users.map(user => <li key={user.id}>
      <button type="button" onClick={() => onSelect(user.id)}>{user.name}</button>
    </li>)}</ul>
  </section>;
}

export { UserSearch };
