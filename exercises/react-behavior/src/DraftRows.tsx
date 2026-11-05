import { useState } from 'react';

function DraftRow({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial);
  return <li><label>Документ {id}
    <input aria-label={`Черновик ${id}`} value={text} onChange={event => setText(event.target.value)} />
  </label></li>;
}

export function DraftRows() {
  const [rows, setRows] = useState([{ id: 'a', title: 'План A' }, { id: 'b', title: 'План B' }]);
  return <section>
    <button type="button" onClick={() => setRows(previous => [...previous].reverse())}>Поменять порядок</button>
    <ul>{rows.map(row => <DraftRow key={row.id} id={row.id} initial={row.title} />)}</ul>
  </section>;
}
