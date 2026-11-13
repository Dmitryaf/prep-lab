import test from "node:test";
import assert from "node:assert/strict";
import { createPinia, disposePinia } from "pinia";
import { useNotices } from "#ui/shared/model/notices.ts";

test("saved rating confirmation disappears after three seconds", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const notices = useNotices(pinia);

  notices.notify("Отметка сохранена.", "success");
  t.mock.timers.tick(2999);
  assert.equal(notices.message, "Отметка сохранена.");
  t.mock.timers.tick(1);
  assert.equal(notices.message, "");
});

test("repeating the same success message starts a fresh display period", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const notices = useNotices(pinia);

  notices.notify("Отметка сохранена.", "success");
  t.mock.timers.tick(2000);
  notices.notify("Отметка сохранена.", "success");
  t.mock.timers.tick(1000);
  assert.equal(notices.message, "Отметка сохранена.");
  t.mock.timers.tick(1999);
  assert.equal(notices.message, "Отметка сохранена.");
  t.mock.timers.tick(1);
  assert.equal(notices.message, "");
});

test("an error replacing a success survives the previous deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const notices = useNotices(pinia);

  notices.notify("Попытка сохранена.", "success");
  t.mock.timers.tick(2000);
  notices.notify("Не удалось сохранить изменение.", "error");
  t.mock.timers.tick(60_000);
  assert.equal(notices.message, "Не удалось сохранить изменение.");

  notices.notify("Отметка сохранена.", "success");
  t.mock.timers.tick(3000);
  assert.equal(notices.message, "");
});

test("existing informational notices remain until replaced", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const notices = useNotices(pinia);

  notices.notify("Отметка сохранена.", "success");
  notices.notify("Некоторые материалы требуют внимания.");
  t.mock.timers.tick(60_000);
  assert.equal(notices.message, "Некоторые материалы требуют внимания.");
});

test("disposing the store cancels its pending message update", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const notices = useNotices(pinia);

  notices.notify("Отметка сохранена.", "success");
  notices.$dispose();
  t.mock.timers.tick(3000);
  assert.equal(notices.message, "Отметка сохранена.");
});
