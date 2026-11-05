// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ItemsWithOfflineLog } from '../src/examples/offline';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('review: one timer, current count, online stops it in StrictMode', () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  render(<StrictMode><ItemsWithOfflineLog /></StrictMode>);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Строка 1']);
  fireEvent(window, new Event('offline'));
  fireEvent(window, new Event('offline'));
  expect(vi.getTimerCount()).toBe(1);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(log.mock.calls).toEqual([[1]]);
  fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(screen.getByText('Всего: 2')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(log.mock.calls).toEqual([[1], [2]]);
  fireEvent(window, new Event('online'));
  expect(vi.getTimerCount()).toBe(0);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(log).toHaveBeenCalledTimes(2);
});

test('unmount removes timer and event listeners; remount starts cleanly', () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const view = render(<StrictMode><ItemsWithOfflineLog /></StrictMode>);
  fireEvent(window, new Event('offline'));
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  fireEvent(window, new Event('offline'));
  act(() => { vi.advanceTimersByTime(2000); });
  expect(vi.getTimerCount()).toBe(0);
  expect(log).not.toHaveBeenCalled();
  render(<StrictMode><ItemsWithOfflineLog /></StrictMode>);
  fireEvent(window, new Event('offline'));
  act(() => { vi.advanceTimersByTime(1000); });
  expect(log.mock.calls).toEqual([[0]]);
  expect(vi.getTimerCount()).toBe(1);
});
