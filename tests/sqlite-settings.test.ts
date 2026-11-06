import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { SettingsRepository } from "#server/infrastructure/storage/settings.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";

test("settings migration is one-time; conflicts and failed transactions preserve the accepted value", () => {
  const database = openDatabase(":memory:"),
    repository = new SettingsRepository(database);
  try {
    const first = repository.migrateSourceRoot("C:\\Work\\original");
    assert.equal(first.settings.sourceRoot, "C:\\Work\\original");
    const accepted = repository.save(
      { ...first.settings, sourceRoot: "C:\\Work\\edited" },
      first.revision,
    );
    assert.deepEqual(
      repository.migrateSourceRoot("C:\\Work\\original"),
      accepted,
    );
    assert.throws(
      () => repository.save(first.settings, first.revision),
      RevisionConflict,
    );
    database.exec(
      "CREATE TRIGGER fail_settings BEFORE UPDATE ON instance_meta BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
    assert.throws(
      () =>
        repository.save(
          { ...accepted.settings, sourceRoot: "" },
          accepted.revision,
        ),
      /test failure/,
    );
    assert.deepEqual(repository.read(), accepted);
    assert.throws(() =>
      repository.save(
        { sourceRoot: "", profile: "unknown" },
        accepted.revision,
      ),
    );
    assert.deepEqual(repository.read(), accepted);
  } finally {
    database.close();
  }
});
