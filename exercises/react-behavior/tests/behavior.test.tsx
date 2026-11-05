// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { UserSearch, type Loader, type User } from '../src/examples/search';
import { useResize } from '../src/examples/resize';
import { SaveName } from '../src/examples/form';
import { AppRoutes } from '../src/examples/router';
import { DraftRows } from '../src/DraftRows';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function advance(ms = 300) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('search: the shipped component mounted in StrictMode', () => {
  function setup(query = 'A') {
    vi.useFakeTimers();
    const requests: Array<ReturnType<typeof deferred<User[]>> & { term: string; org: string; signal: AbortSignal }> = [];
    // Deliberately ignores abort: currentness must protect visible state independently.
    const load: Loader = vi.fn((org, term, { signal }) => {
      const request = { ...deferred<User[]>(), term, org, signal };
      requests.push(request);
      return request.promise;
    });
    const props = { orgId: 'one', query, onQueryChange: vi.fn(), onSelect: vi.fn(), loadUsers: load, delay: 300 };
    const view = render(<StrictMode><UserSearch {...props} /></StrictMode>);
    return { requests, props, view, load,
      change: (patch: Partial<typeof props>) => {
        Object.assign(props, patch);
        view.rerender(<StrictMode><UserSearch {...props} /></StrictMode>);
      } };
  }

  test('debounce starts only the current term; unmount cancels a pending timer', async () => {
    const s = setup();
    await advance(100); s.change({ query: 'B' });
    await advance(299); expect(s.requests).toHaveLength(0);
    await advance(1); expect(s.requests.map(r => r.term)).toEqual(['B']);
    s.change({ query: 'C' }); s.view.unmount(); await advance();
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].signal.aborted).toBe(true);
  });

  test('old success cannot replace new success; visible text and selection are safe', async () => {
    const s = setup(); await advance(); s.change({ query: 'B' }); await advance();
    await act(async () => s.requests[1].resolve([{ id: 'b', name: '<img src=x>' }]));
    await act(async () => s.requests[0].resolve([{ id: 'a', name: 'Старый' }]));
    const button = screen.getByRole('button', { name: '<img src=x>' });
    expect(screen.queryByText('Старый')).toBeNull();
    expect(s.view.container.querySelector('img')).toBeNull();
    fireEvent.click(button);
    expect(s.props.onSelect).toHaveBeenCalledWith('b');
  });

  test('old failure cannot end loading or show an error for the new request', async () => {
    const s = setup(); await advance(); s.change({ query: 'B' }); await advance();
    await act(async () => s.requests[0].reject(new Error('old')));
    expect(screen.getByRole('status').textContent).toBe('Загрузка…');
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => s.requests[1].resolve([]));
    expect(screen.getByRole('status').textContent).toBe('Ничего не найдено.');
  });

  test('current failure is visible; changing organization hides the previous result immediately', async () => {
    const s = setup(); await advance();
    await act(async () => s.requests[0].resolve([{ id: 'a', name: 'Организация один' }]));
    s.change({ orgId: 'two' });
    expect(screen.queryByText('Организация один')).toBeNull();
    await advance(); expect(s.requests[1].org).toBe('two');
    await act(async () => s.requests[1].reject(new Error('current')));
    expect(screen.getByRole('alert').textContent).toContain('Не удалось');
  });

  test('empty input hides pending data, cancels work and does not start a request', async () => {
    const s = setup(); await advance(); s.change({ query: '  ' });
    await act(async () => s.requests[0].resolve([{ id: 'a', name: 'Поздний' }]));
    await advance();
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].signal.aborted).toBe(true);
    expect(screen.queryByText('Поздний')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('external query is displayed, and typing reports to the owner', async () => {
    const s = setup('Первый');
    s.change({ query: 'Внешний' });
    expect((screen.getByLabelText('Поиск пользователей') as HTMLInputElement).value).toBe('Внешний');
    fireEvent.change(screen.getByLabelText('Поиск пользователей'), { target: { value: 'Ввод' } });
    expect(s.props.onQueryChange).toHaveBeenCalledWith('Ввод');
  });

  test('unmount aborts a started request; a late rejection remains handled', async () => {
    const s = setup(); await advance(); s.view.unmount();
    expect(s.requests[0].signal.aborted).toBe(true);
    await act(async () => s.requests[0].reject(new Error('after unmount')));
    expect(s.view.container.childElementCount).toBe(0);
  });
});

test('resize uses the new callback without re-subscribing and releases the listener', () => {
  const a = vi.fn(), b = vi.fn();
  const add = vi.spyOn(window, 'addEventListener');
  function Probe({ callback }: { callback: () => void }) { useResize(callback); return null; }
  const view = render(<StrictMode><Probe callback={a} /></StrictMode>);
  fireEvent(window, new Event('resize'));
  const count = add.mock.calls.filter(call => call[0] === 'resize').length;
  view.rerender(<StrictMode><Probe callback={b} /></StrictMode>);
  expect(add.mock.calls.filter(call => call[0] === 'resize')).toHaveLength(count);
  fireEvent(window, new Event('resize'));
  expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
  view.unmount(); fireEvent(window, new Event('resize'));
  expect(b).toHaveBeenCalledTimes(1);
});

test('form keeps input after an error and permits a successful retry', async () => {
  const user = userEvent.setup();
  const first = deferred<void>(), second = deferred<void>();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(<SaveName save={save} />);
  const input = screen.getByLabelText('Имя для сохранения') as HTMLInputElement;
  await user.type(input, ' Анна ');
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(save).toHaveBeenCalledWith('Анна');
  expect(input.disabled).toBe(true);
  // A second direct submit before completion must not start another save.
  fireEvent.submit(input.closest('form')!);
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => first.reject(new Error('offline')));
  expect(screen.getByRole('alert').textContent).toContain('Повторите');
  expect(input.value).toBe(' Анна '); expect(input.disabled).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));
  await act(async () => second.resolve());
  expect(screen.getByRole('status').textContent).toBe('Сохранено');
});

test('blank form reports validation and never calls the server', async () => {
  const save = vi.fn();
  render(<SaveName save={save} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(screen.getByRole('alert').textContent).toBe('Введите имя');
  expect(save).not.toHaveBeenCalled();
});

test('stable entity keys preserve each row draft after reordering', async () => {
  const user = userEvent.setup();
  render(<DraftRows />);
  const input = screen.getByLabelText('Черновик a');
  await user.clear(input); await user.type(input, 'Изменён A');
  await user.click(screen.getByRole('button', { name: 'Поменять порядок' }));
  expect((screen.getByLabelText('Черновик a') as HTMLInputElement).value).toBe('Изменён A');
  expect((screen.getByLabelText('Черновик b') as HTMLInputElement).value).toBe('План B');
  expect(screen.getAllByRole('textbox')[0].getAttribute('aria-label')).toBe('Черновик b');
});

test('URL initializes filter and Back restores the edited filter', async () => {
  const user = userEvent.setup();
  function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Назад</button>; }
  render(<MemoryRouter initialEntries={['/documents?q=план']}><AppRoutes /><Back /></MemoryRouter>);
  const filter = screen.getByLabelText('Фильтр') as HTMLInputElement;
  expect(filter.value).toBe('план');
  await user.clear(filter); await user.type(filter, 'новый');
  await user.click(screen.getByRole('link', { name: 'Открыть документ 42' }));
  expect(screen.getByRole('heading', { name: 'Документ 42' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Назад' }));
  expect((screen.getByLabelText('Фильтр') as HTMLInputElement).value).toBe('новый');
});
