// checked-example: react-router
import { BrowserRouter, Link, Outlet, Route, Routes, useParams, useSearchParams } from 'react-router-dom';

function Layout() {
  return <><nav><Link to="/documents?q=план">Документы</Link></nav><Outlet /></>;
}
function Documents() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  return <>
    <label>Фильтр<input value={query} onChange={event => {
      const next = new URLSearchParams(params);
      if (event.target.value) next.set('q', event.target.value); else next.delete('q');
      setParams(next, { replace: true });
    }} /></label>
    <Link to="/documents/42">Открыть документ 42</Link>
  </>;
}
function Document() {
  const { id } = useParams();
  return <h2>Документ {id}</h2>;
}
export function AppRoutes() {
  return <Routes><Route path="/" element={<Layout />}>
    <Route index element={<p>Выберите документы</p>} />
    <Route path="documents" element={<Documents />} />
    <Route path="documents/:id" element={<Document />} />
    <Route path="*" element={<p>Страница не найдена</p>} />
  </Route></Routes>;
}
export function RouterApp() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
