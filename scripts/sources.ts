import { resolve, isAbsolute } from "node:path";
import {
  getSources,
  closeDatabase,
} from "../server/infrastructure/storage/runtime.ts";
import { validateSourceRoot } from "../server/infrastructure/sources/folder.ts";
const [command, id, name, path] = process.argv.slice(2);
try {
  if (
    command !== "allow" ||
    !/^[a-z0-9-]{1,80}$/.test(id || "") ||
    !name ||
    name.length > 160 ||
    !path ||
    !isAbsolute(path)
  )
    throw new Error(
      'Использование: node --experimental-strip-types scripts/sources.ts allow <id> "Название" "Абсолютная папка сервера"',
    );
  getSources().allowRoot(id, name, await validateSourceRoot(resolve(path)));
  console.log("Папка разрешена для чтения: " + name);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Не удалось разрешить папку.",
  );
  process.exitCode = 1;
} finally {
  closeDatabase();
}
