import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NameEditor } from './examples/composition';
import { SaveName } from './examples/form';
import { UserSearch, type Loader, type User } from './examples/search';
import { useResize } from './examples/resize';
import { DraftRows } from './DraftRows';
import './style.css';

type Request = { id: number; org: string; term: string; resolve: (users: User[]) => void; reject: (error: Error) => void };
let requestId = 0;

function SearchLab() {
  const [query, setQuery] = useState('');
  const [org, setOrg] = useState('one');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState<Request[]>([]);
  // Intentionally ignores AbortSignal so students can control stale responses.
  const load = useCallback<Loader>((org, term) => new Promise((resolve, reject) => {
    const request = { id: ++requestId, org, term, resolve, reject };
    setPending(previous => [...previous, request]);
  }), []);
  function finish(request: Request, fail: boolean) {
    if (fail) request.reject(new Error('Учебный отказ'));
    else request.resolve([{ id: String(request.id), name: `${request.org}: ${request.term}` }]);
    setPending(previous => previous.filter(item => item.id !== request.id));
  }
  return <section>
    <h2>Поиск: ответьте в обратном порядке</h2>
    <p>Введите A, дождитесь запроса, затем B. Завершите B перед A. Старый ответ не должен изменить результат. Загрузчик намеренно игнорирует отмену.</p>
    <label>Организация <select value={org} onChange={event => setOrg(event.target.value)}>
      <option value="one">Первая</option><option value="two">Вторая</option>
    </select></label>
    <UserSearch orgId={org} query={query} onQueryChange={setQuery} onSelect={setSelected} loadUsers={load} />
    <p>Выбранный ID: {selected || 'нет'}</p>
    <ul>{pending.map(request => <li key={request.id}>
      Запрос {request.id}: {request.org} / {request.term}{' '}
      <button onClick={() => finish(request, false)}>Успех {request.id}</button>{' '}
      <button onClick={() => finish(request, true)}>Ошибка {request.id}</button>
    </li>)}</ul>
  </section>;
}

function FormLab() {
  const [fail, setFail] = useState(true);
  async function save() {
    await new Promise(resolve => setTimeout(resolve, 600));
    if (fail) throw new Error('Учебная ошибка');
  }
  return <section><h2>Форма: сохраните ввод после отказа</h2>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} /> Ответить ошибкой</label>
    <SaveName save={save} />
  </section>;
}

function ResizeProbe({ label, notify }: { label: string; notify: (value: string) => void }) {
  useResize(() => notify(label));
  return <p>Подписка подключена, callback: {label}</p>;
}
function ResizeLab() {
  const [mounted, setMounted] = useState(true);
  const [label, setLabel] = useState('A');
  const [events, setEvents] = useState<string[]>([]);
  return <section><h2>Подписка: callback и очистка</h2>
    <button onClick={() => setLabel(previous => previous === 'A' ? 'B' : 'A')}>Сменить callback</button>{' '}
    <button onClick={() => setMounted(previous => !previous)}>{mounted ? 'Отключить' : 'Подключить'}</button>{' '}
    <button onClick={() => window.dispatchEvent(new Event('resize'))}>Вызвать resize</button>
    {mounted && <ResizeProbe label={label} notify={value => setEvents(previous => [...previous, value])} />}
    <p>Вызовы: {events.join(', ') || 'нет'}</p>
  </section>;
}

function App() {
  return <main><h1>Практикум React</h1>
    <p>Учебные данные, локальные операции. Сначала предскажите результат, затем измените одно условие.</p>
    <section><h2>Композиция: один владелец имени</h2><NameEditor /></section>
    <SearchLab /><FormLab />
    <section><h2>Идентичность: измените строку и переставьте список</h2><DraftRows /></section>
    <ResizeLab />
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
