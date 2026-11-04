import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { CredentialStore, credentialSchema } from "./credentials.ts";
import { LoginManager } from "./login.ts";
import { issuer, planScopes } from "./oauth.ts";

export async function importCredentials(
  store: CredentialStore,
  input: string,
  key: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(`${issuer}/.well-known/jwks.json`),
  ),
) {
  if (Buffer.byteLength(input, "utf8") > 100000)
    throw new Error("Файл подключения слишком большой.");
  const value = credentialSchema.parse(JSON.parse(input));
  const saved = new Date(value.savedAt);
  if (saved.getTime() > Date.now() + 300000)
    throw new Error("Неверное время сохранённой сессии.");
  const verified = await jwtVerify(value.tokens.id_token, key, {
    issuer,
    audience: value.clientId,
    requiredClaims: ["sub", "exp", "iat"],
    currentDate: saved,
    clockTolerance: 5,
  });
  if (verified.payload.sub !== value.subject)
    throw new Error("Пользователь сессии не совпадает.");
  planScopes(value.tokens.scope);
  const current = store.registration();
  if (
    current &&
    (current.clientId !== value.clientId || current.subject !== value.subject)
  )
    throw new Error(
      "На экземпляре сохранена другая регистрация. Используйте отдельный каталог данных для другого аккаунта.",
    );
  store.save(value);
}
export async function assistantCommand(args: string[]) {
  const [command, file] = args,
    store = new CredentialStore();
  if (command === "host" && args.length === 1) {
    console.log(store.hostId());
    return;
  }
  if (command === "status" && args.length === 1) {
    console.log(JSON.stringify(store.status()));
    return;
  }
  if (command === "login" && args.length === 1) {
    const manager = new LoginManager(store),
      started = await manager.begin();
    console.log(
      "Откройте ссылку в браузере этого компьютера. Запросы модели не отправляются:",
    );
    console.log(started.url);
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (!manager.status().pending) {
          clearInterval(timer);
          resolve();
        }
      }, 500);
    });
    console.log(manager.status().message);
    if (!store.status().connected) process.exitCode = 1;
    return;
  }
  if (command === "import" && file && args.length === 2 && isAbsolute(file)) {
    await importCredentials(store, readFileSync(resolve(file), "utf8"));
    console.log(
      "Подключение импортировано. ID этого экземпляра сохранён. Запросов модели: 0.",
    );
    return;
  }
  if (command === "import-stdin" && args.length === 1) {
    let text = "";
    for await (const part of process.stdin) {
      text += part.toString();
      if (Buffer.byteLength(text) > 100000)
        throw new Error("Файл подключения слишком большой.");
    }
    await importCredentials(store, text);
    console.log(
      "Подключение импортировано. ID этого экземпляра сохранён. Запросов модели: 0.",
    );
    return;
  }
  throw new Error(
    "Команды: host, status, login, import <абсолютный файл>, import-stdin.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await assistantCommand(process.argv.slice(2));
  } catch {
    console.error(
      "Операция подключения не завершена. Проверьте команду, права и выбранную регистрацию. Секреты не выводятся.",
    );
    process.exitCode = 1;
  }
}
