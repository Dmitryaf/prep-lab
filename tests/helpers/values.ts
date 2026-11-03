import assert from "node:assert/strict";

export function required<T>(value: T): NonNullable<T> {
  assert(
    value !== undefined && value !== null,
    "Отсутствуют ожидаемые тестовые данные",
  );
  return value;
}
