<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import {
  claimVoice,
  releaseVoice,
  voiceOwner,
  canLeaveVoice,
} from "#ui/features/voice-input/model/guard.ts";
import { recordedWav } from "#ui/features/voice-input/model/audio.ts";
import { speechMaxSeconds } from "#domain/speech/wav.ts";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    maxLength?: number;
    label: string;
    rows?: number;
    placeholder?: string;
  }>(),
  { maxLength: 100000, rows: 4, placeholder: "" },
);
const emit = defineEmits<{
  "update:modelValue": [text: string];
  changed: [];
  blur: [];
}>();
const id = Symbol("dictation");
const fieldId = useId();
const field = ref<HTMLTextAreaElement>();
defineExpose({ focus: () => field.value?.focus({ preventScroll: true }) });
const state = ref<
  | "idle"
  | "permission"
  | "recording"
  | "paused"
  | "stopping"
  | "ready"
  | "transcribing"
>("idle");
const message = ref("");
const error = ref("");
const available = ref<boolean | null>(null);
const blob = ref<Blob>();
const recordingUrl = ref("");
let recorder: MediaRecorder | undefined;
let stream: MediaStream | undefined;
let request: AbortController | undefined;
let chunks: Blob[] = [];
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let recognizeOnStop = true;
const owned = computed(() => voiceOwner.value === id);
const anotherActive = computed(() => !!voiceOwner.value && !owned.value);
const supported = ref(true);
const statusLabel = computed(
  () =>
    ({
      idle: "",
      permission: "Ожидаю доступ к микрофону…",
      recording: "Слушаю",
      paused: "Пауза",
      stopping: "Подготавливаю запись…",
      ready: "Запись готова",
      transcribing: "Распознаю на компьютере…",
    })[state.value],
);
async function check() {
  error.value = "";
  try {
    const response = await fetch("/api/speech");
    if (!response.ok) throw new Error();
    available.value = (await response.json()).available === true;
  } catch {
    available.value = null;
    error.value = "Не удалось проверить распознавание. Попробуйте ещё раз.";
  }
}
function warn() {
  message.value = "Завершите диктовку или отмените запись перед переходом.";
}
function stopTracks() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  clearTimeout(timer);
}
function setBlob(value: Blob) {
  if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
  blob.value = value;
  recordingUrl.value = URL.createObjectURL(value);
}
async function start() {
  if (!claimVoice(id, warn)) return;
  error.value = "";
  message.value = "";
  const version = ++generation;
  state.value = "permission";
  try {
    const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (version !== generation) {
      captured.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = captured;
    chunks = [];
    recorder = new MediaRecorder(captured);
    recorder.ondataavailable = (event) => {
      if (version === generation && event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (version !== generation) return;
      const type = recorder?.mimeType || chunks[0]?.type || "audio/webm";
      stopTracks();
      setBlob(new Blob(chunks, { type }));
      state.value = "ready";
      if (recognizeOnStop) void transcribe();
    };
    recorder.onerror = () => {
      error.value = "Запись прервалась. Можно распознать сохранённую часть.";
      stop(false);
    };
    captured.getTracks().forEach((track) =>
      track.addEventListener("ended", () => {
        if (
          version === generation &&
          ["recording", "paused"].includes(state.value)
        ) {
          error.value = "Микрофон отключён. Запись остановлена.";
          stop(false);
        }
      }),
    );
    recorder.start(1000);
    state.value = "recording";
    timer = setTimeout(() => {
      message.value =
        "Достигнут предел одной записи — 15 минут. Можно распознать эту часть и продолжить.";
      stop();
    }, speechMaxSeconds * 1000);
  } catch (cause) {
    if (version !== generation) return;
    stopTracks();
    releaseVoice(id);
    state.value = "idle";
    error.value =
      cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Разрешите доступ к микрофону в настройках сайта."
        : "Не удалось включить микрофон. Проверьте подключение и разрешения браузера.";
  }
}
function pause() {
  if (recorder?.state === "recording") {
    recorder.pause();
    state.value = "paused";
  } else if (recorder?.state === "paused") {
    recorder.resume();
    state.value = "recording";
  }
}
function stop(recognize = true) {
  recognizeOnStop = recognize;
  if (recorder && recorder.state !== "inactive") {
    state.value = "stopping";
    recorder.stop();
  }
  stopTracks();
}
async function transcribe() {
  if (!blob.value) return;
  const version = ++generation;
  state.value = "transcribing";
  error.value = "";
  message.value = "";
  request = new AbortController();
  try {
    const wav = await recordedWav(blob.value);
    if (version !== generation) return;
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
      signal: request.signal,
    });
    const result = await response.json();
    if (version !== generation) return;
    if (!response.ok)
      throw new Error(result.error || "Не удалось распознать запись.");
    if (typeof result.text !== "string")
      throw new Error("Распознавание вернуло некорректный ответ.");
    const transcript = result.text.trim();
    if (!transcript)
      throw new Error(
        "Речь не распознана. Можно прослушать запись и повторить попытку.",
      );
    const text = [props.modelValue, transcript].filter(Boolean).join("\n\n");
    if (text.length > props.maxLength)
      throw new Error(
        "Текст не помещается в поле. Сократите ответ и повторите распознавание.",
      );
    emit("update:modelValue", text);
    emit("changed");
    cancel();
    message.value = "Диктовка добавлена.";
  } catch (cause) {
    if (version !== generation) return;
    state.value = "ready";
    error.value =
      cause instanceof Error ? cause.message : "Не удалось распознать запись.";
  } finally {
    if (version === generation) request = undefined;
  }
}
function stopTranscription() {
  generation++;
  request?.abort();
  request = undefined;
  state.value = "ready";
  message.value = "Распознавание остановлено. Запись сохранена.";
}
function cancel() {
  generation++;
  request?.abort();
  request = undefined;
  if (recorder?.state !== "inactive") recorder?.stop();
  stopTracks();
  recorder = undefined;
  chunks = [];
  if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value);
  recordingUrl.value = "";
  blob.value = undefined;
  state.value = "idle";
  error.value = "";
  message.value = "";
  releaseVoice(id);
}
function input(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  emit("changed");
}
function protect(event: BeforeUnloadEvent) {
  if (owned.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => {
  supported.value =
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";
  void check();
  window.addEventListener("beforeunload", protect);
});
onBeforeRouteLeave(() => canLeaveVoice());
onBeforeRouteUpdate(() => canLeaveVoice());
onBeforeUnmount(() => {
  cancel();
  window.removeEventListener("beforeunload", protect);
});
</script>
<template>
  <div class="voice-input">
    <label :for="fieldId">{{ label }}</label>
    <div
      class="answer-composer"
      :class="{ 'is-recording': state === 'recording' }"
    >
      <textarea
        :id="fieldId"
        ref="field"
        :value="modelValue"
        :rows="rows"
        :maxlength="maxLength"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="input"
        @blur="$emit('blur')"
      />
      <div class="composer-toolbar">
        <span class="voice-status" role="status">{{
          state === "idle" ? message : statusLabel
        }}</span>
        <div class="voice-actions">
          <button
            v-if="state === 'idle'"
            class="voice-icon"
            type="button"
            aria-label="Голосовой ввод"
            title="Голосовой ввод"
            :disabled="
              disabled || anotherActive || !supported || available !== true
            "
            @click="start"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            </svg>
          </button>
          <template v-if="state === 'recording' || state === 'paused'">
            <button
              class="voice-icon"
              type="button"
              :aria-label="state === 'paused' ? 'Продолжить запись' : 'Пауза'"
              :title="state === 'paused' ? 'Продолжить запись' : 'Пауза'"
              @click="pause"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path v-if="state === 'paused'" d="m8 4 12 8-12 8z" />
                <path v-else d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            </button>
            <button
              class="voice-icon primary"
              type="button"
              aria-label="Завершить запись"
              title="Завершить запись"
              @click="stop()"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </button>
          </template>
          <button
            v-if="state === 'transcribing'"
            type="button"
            class="voice-icon"
            aria-label="Остановить распознавание"
            title="Остановить распознавание"
            @click="stopTranscription"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
          <button v-if="state === 'ready'" type="button" @click="transcribe">
            Повторить распознавание
          </button>
          <button
            v-if="state !== 'idle'"
            class="voice-icon"
            type="button"
            aria-label="Отменить диктовку"
            title="Отменить диктовку"
            @click="cancel"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
          <slot name="actions" :active="owned" />
        </div>
      </div>
    </div>
    <p v-if="!supported">
      Для микрофона откройте приложение через HTTPS или localhost в браузере с
      поддержкой записи.
    </p>
    <details v-else-if="available === false">
      <summary>Подключить голосовой ввод</summary>
      <p>
        На компьютере с Prep Lab выполните <code>npm run speech:setup</code>.
      </p>
      <button type="button" @click="check">Проверить подключение</button>
    </details>
    <button
      v-else-if="available === null && error"
      type="button"
      @click="check"
    >
      Проверить подключение
    </button>
    <template v-if="state === 'ready' && recordingUrl"
      ><audio controls :src="recordingUrl" /><a
        :href="recordingUrl"
        :download="
          'answer.' +
          (blob?.type.includes('mp4')
            ? 'mp4'
            : blob?.type.includes('ogg')
              ? 'ogg'
              : 'webm')
        "
        >Скачать запись</a
      ></template
    >
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message && state !== 'idle'" role="status">{{ message }}</p>
  </div>
</template>
<style scoped>
.voice-input {
  margin-block: 12px;
  min-width: 0;
}
.voice-input > label {
  display: block;
  margin-bottom: 8px;
}
.answer-composer {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  overflow: hidden;
}
.answer-composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.answer-composer.is-recording {
  border-color: var(--accent);
}
.answer-composer textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 16px;
  margin: 0;
  resize: vertical;
  outline: none;
  box-shadow: none;
}
.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
}
.voice-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.voice-actions :deep(.voice-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border-radius: 50%;
  flex-shrink: 0;
}
.voice-icon:not(.primary) {
  border-color: transparent;
  background: transparent;
}
.voice-icon:not(.primary):hover:not(:disabled) {
  border-color: var(--border);
}
.voice-status {
  color: var(--muted);
  font-size: 13px;
}
.voice-input audio {
  display: block;
  max-width: 100%;
  margin-block: 12px;
}
.voice-input p {
  margin-block: 8px;
}
.voice-input summary {
  cursor: pointer;
  margin-top: 8px;
}
@media (max-width: 520px) {
  .composer-toolbar {
    flex-wrap: wrap;
  }
  .voice-actions {
    margin-left: auto;
  }
}
</style>
