// checked-example: react-composition
import { useState, type ReactNode } from 'react';

type NameFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  children?: ReactNode;
};

export function NameField({ value, onValueChange, children }: NameFieldProps) {
  return <section>
    <label>Имя
      <input value={value} onChange={event => onValueChange(event.target.value)} />
    </label>
    {children}
  </section>;
}

export function NameEditor() {
  const [name, setName] = useState('Анна');
  return <NameField value={name} onValueChange={setName}>
    <p>Привет, {name || 'гость'}!</p>
  </NameField>;
}
