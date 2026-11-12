import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error(
    "Для этой ОС установите whisper.cpp и задайте PREP_LAB_WHISPER_BIN и PREP_LAB_WHISPER_MODEL. Инструкция: docs/voice-input.md",
  );
}
const root = resolve(process.env.FRONTEND_LAB_DATA_DIR || ".local", "speech");
await mkdir(root, { recursive: true });
async function checksum(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function download(url: string, name: string, expected: string) {
  const destination = join(root, name);
  if (await stat(destination).catch(() => null)) {
    if ((await checksum(destination)) !== expected)
      throw new Error(
        `Неверная контрольная сумма ${name}. Проверьте файл перед повторной установкой.`,
      );
    return destination;
  }
  process.stdout.write(`Загружаю ${name}…\n`);
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error(`Не удалось скачать ${name}: HTTP ${response.status}`);
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    createWriteStream(destination + ".download"),
  );
  if ((await checksum(destination + ".download")) !== expected)
    throw new Error(`Контрольная сумма загрузки ${name} не совпала.`);
  await rename(destination + ".download", destination);
  return destination;
}
const archive = await download(
  "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
  "whisper-b5454.zip",
  "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
);
const binary = join(root, "b5454", "Release", "whisper-cli.exe");
if (!(await stat(binary).catch(() => null))) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:PREP_SPEECH_ARCHIVE -DestinationPath $env:PREP_SPEECH_DESTINATION",
    ],
    {
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        PREP_SPEECH_ARCHIVE: archive,
        PREP_SPEECH_DESTINATION: dirname(dirname(binary)),
      },
    },
  );
  if (result.status !== 0) throw new Error("Не удалось распаковать Whisper.");
}
await download(
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
  "ggml-small-q5_1.bin",
  "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
);
process.stdout.write(
  "Локальное распознавание установлено. Откройте голосовой ввод в Prep Lab.\n",
);
