export type User = { id: string; name: string };

export function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'name' in value && typeof value.name === 'string';
}

export async function searchUsers(query: string, signal: AbortSignal): Promise<User[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
  const value: unknown = await response.json();
  if (!Array.isArray(value) || !value.every(isUser)) {
    throw new Error('Сервер вернул неверный список пользователей');
  }
  return value;
}
