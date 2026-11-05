// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NameEditor, NameField } from '../src/examples/composition';

afterEach(cleanup);

test('parent owns the input and the composed greeting', async () => {
  const user = userEvent.setup();
  render(<NameEditor />);
  await user.clear(screen.getByLabelText('Имя'));
  await user.type(screen.getByLabelText('Имя'), 'Ирина');
  expect(screen.getByText('Привет, Ирина!')).toBeTruthy();
});

test('an external value update reaches the field without a stale local copy', () => {
  const onValueChange = vi.fn();
  const view = render(<NameField value="Анна" onValueChange={onValueChange}>Подсказка</NameField>);
  view.rerender(<NameField value="Олег" onValueChange={onValueChange}>Новая подсказка</NameField>);
  expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Олег');
  expect(screen.getByText('Новая подсказка')).toBeTruthy();
  expect(onValueChange).not.toHaveBeenCalled();
});
