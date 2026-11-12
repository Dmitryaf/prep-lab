import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function whisperPaths() {
  const root = resolve(process.env.FRONTEND_LAB_DATA_DIR || ".local", "speech");
  return {
    root,
    binary:
      process.env.PREP_LAB_WHISPER_BIN ||
      join(root, "b5454", "Release", "whisper-cli.exe"),
    model:
      process.env.PREP_LAB_WHISPER_MODEL || join(root, "ggml-small-q5_1.bin"),
  };
}
export function whisperAvailable() {
  const { binary, model } = whisperPaths();
  return existsSync(binary) && existsSync(model);
}
export async function transcribeLocal(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<string> {
  const { root, binary, model } = whisperPaths();
  if (!whisperAvailable())
    throw new Error(
      "Whisper не установлен. Выполните npm run speech:setup на компьютере с Prep Lab.",
    );
  signal.throwIfAborted();
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "recording-"));
  try {
    const audio = join(directory, "voice.wav");
    const output = join(directory, "result");
    await writeFile(audio, bytes);
    signal.throwIfAborted();
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        binary,
        [
          "-m",
          model,
          "-f",
          audio,
          "-l",
          "ru",
          "-otxt",
          "-of",
          output,
          "-nt",
          "-np",
        ],
        { windowsHide: true, stdio: "ignore", signal },
      );
      let failure: Error | undefined;
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", (code) =>
        failure
          ? reject(failure)
          : code === 0
            ? resolvePromise()
            : reject(
                new Error(
                  "Whisper не смог распознать запись. Сохраните аудио и повторите попытку.",
                ),
              ),
      );
    });
    signal.throwIfAborted();
    return (await readFile(output + ".txt", "utf8")).trim();
  } finally {
    // Only this request's mkdtemp directory is removed, after the child has exited.
    await rm(directory, { recursive: true, force: true });
  }
}
