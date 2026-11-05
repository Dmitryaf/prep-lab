// checked-example: react-offline-review
import { useEffect, useEffectEvent, useRef, useState } from 'react';

function ItemsWithOfflineLog() {
  const [items, setItems] = useState<Array<{ id: number; title: string }>>([]);
  const nextId = useRef(0);
  const onTick = useEffectEvent(() => console.log(items.length));

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    }
    function start() {
      if (timer === null) timer = setInterval(() => onTick(), 1000);
    }
    window.addEventListener('offline', start);
    window.addEventListener('online', stop);
    return () => {
      window.removeEventListener('offline', start);
      window.removeEventListener('online', stop);
      stop();
    };
  }, []);

  function addItem() {
    const id = ++nextId.current;
    setItems(previous => [...previous, { id, title: `Строка ${id}` }]);
  }
  return <>
    <button onClick={addItem}>Добавить</button>
    <p>Всего: {items.length}</p>
    <ul>{items.map(item => <li key={item.id}>{item.title}</li>)}</ul>
  </>;
}

export { ItemsWithOfflineLog };
