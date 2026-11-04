import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  lstatSync,
  existsSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { resolve, join, parse, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { clientIdSchema, tokenResponseSchema } from "./oauth.ts";
export const credentialSchema = z.object({
  clientId: clientIdSchema,
  subject: z.string().min(1),
  tokens: tokenResponseSchema,
  scopes: z.array(z.string()),
  hostId: z.string().regex(/^urn:uuid:/),
  savedAt: z.string().datetime(),
});
export type Credentials = z.infer<typeof credentialSchema>;
export function assistantDirectory() {
  return resolve(
    process.env.FRONTEND_LAB_DATA_DIR || ".local",
    "instance/assistant",
  );
}
export function protectDirectory(directory: string) {
  assertOrdinaryPath(directory, true);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertOrdinaryPath(directory);
  if (!lstatSync(directory).isDirectory())
    throw new Error("Подключение должно храниться в обычном каталоге.");
  if (process.platform === "win32") {
    const principal = execFileSync("whoami", [], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    execFileSync(
      "icacls",
      [directory, "/inheritance:r", "/grant:r", `${principal}:(OI)(CI)F`],
      { windowsHide: true, stdio: "pipe" },
    );
  } else chmodSync(directory, 0o700);
}
function assertOrdinaryPath(path: string, allowMissing = false) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute)
    .split(/[\\/]/)
    .filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error("Каталог подключения не должен содержать ссылки.");
    } catch (error) {
      if (
        allowMissing &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return;
      throw error;
    }
  }
}
export class CredentialStore {
  readonly directory: string;
  constructor(directory = assistantDirectory()) {
    this.directory = resolve(directory);
  }
  hostId() {
    protectDirectory(this.directory);
    const path = join(this.directory, "host-id");
    if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Некорректный файл ID экземпляра.");
      const value = readFileSync(path, "utf8").trim();
      z.uuidv4().parse(value.replace(/^urn:uuid:/, ""));
      if (!value.startsWith("urn:uuid:"))
        throw new Error("Некорректный ID экземпляра.");
      return value;
    }
    const value = `urn:uuid:${randomUUID()}`;
    writeFileSync(path, value, { flag: "wx", mode: 0o600 });
    return value;
  }
  read(): Credentials | null {
    const path = join(this.directory, "credentials.json");
    try {
      assertOrdinaryPath(path);
      const entry = lstatSync(path);
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        (process.platform !== "win32" && entry.mode & 0o077)
      )
        throw new Error("Небезопасные права файла подключения.");
      return credentialSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      // eslint-disable-next-line preserve-caught-error -- Parser causes can include secret token fragments; never propagate them.
      throw new Error(
        "Не удалось прочитать защищённое подключение ChatGPT. Исходный файл сохранён.",
      );
    }
  }
  save(input: Credentials) {
    const value = credentialSchema.parse({ ...input, hostId: this.hostId() });
    this.write("credentials.json", value);
    return value;
  }
  private write(
    name: "credentials.json" | "registration.json",
    value: unknown,
  ) {
    protectDirectory(this.directory);
    const target = join(this.directory, name),
      temporary = join(this.directory, `.private-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(value), {
        flag: "wx",
        mode: 0o600,
      });
      const descriptor = openSync(temporary, "r+");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      if (existsSync(target) && lstatSync(target).isSymbolicLink())
        throw new Error("Некорректный файл подключения.");
      renameSync(temporary, target);
      if (process.platform !== "win32") chmodSync(target, 0o600);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  status() {
    const value = this.read();
    if (!value)
      return { connected: false, expiresAt: null, needsRefresh: false };
    const expires = Date.parse(value.savedAt) + value.tokens.expires_in * 1000;
    return {
      connected: true,
      expiresAt: new Date(expires).toISOString(),
      needsRefresh: Date.now() + 60_000 >= expires,
    };
  }
  registration() {
    const current = this.read();
    if (current)
      return { clientId: current.clientId, subject: current.subject };
    const path = join(this.directory, "registration.json");
    try {
      assertOrdinaryPath(path);
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Некорректный файл регистрации.");
      return z
        .object({ clientId: clientIdSchema, subject: z.string().min(1) })
        .parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      // eslint-disable-next-line preserve-caught-error -- Registration parser causes can include private account data.
      throw new Error("Не удалось прочитать регистрацию ChatGPT.");
    }
  }
  disconnect() {
    const registration = this.registration();
    if (registration) this.write("registration.json", registration);
    const path = join(this.directory, "credentials.json");
    if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Некорректный файл подключения.");
      unlinkSync(path);
    }
  }
}
