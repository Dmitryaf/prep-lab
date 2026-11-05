// checked-example: react-form
import { useRef, useState, type FormEvent } from 'react';

export function SaveName({ save }: { save: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim()) { setError('Введите имя'); setStatus('error'); return; }
    submitting.current = true;
    setStatus('pending'); setError('');
    try {
      await save(name.trim());
      setStatus('success');
    } catch {
      setError('Не удалось сохранить. Повторите отправку.');
      setStatus('error');
    } finally {
      submitting.current = false;
    }
  }
  return <form onSubmit={submit}>
    <label>Имя для сохранения<input value={name} disabled={status === 'pending'}
      aria-describedby={error ? 'name-error' : undefined}
      onChange={event => { setName(event.target.value); setError(''); setStatus('idle'); }} /></label>
    <button disabled={status === 'pending'} type="submit">Сохранить</button>
    {status === 'pending' && <p role="status">Сохраняем…</p>}
    {status === 'success' && <p role="status">Сохранено</p>}
    {error && <p id="name-error" role="alert">{error}</p>}
  </form>;
}
