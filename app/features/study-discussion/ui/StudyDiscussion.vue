<script setup lang="ts">
import {
  ref,
  watch,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  useId,
} from "vue";
import type { DiscussionMaterial } from "#domain/discussion/contracts.ts";
import { useDiscussion } from "#ui/features/study-discussion/model/useDiscussion.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import VoiceInput, { canLeaveVoice } from "#ui/features/voice-input/index.ts";
const props = defineProps<DiscussionMaterial>();
const {
  opened,
  messages,
  draft,
  error,
  busy,
  loading,
  loaded,
  preparedPrompt,
  previewing,
  field,
  controller,
  load,
  toggle,
  send,
  preview,
  stop,
} = useDiscussion(props);
const dialog = ref<HTMLDialogElement>();
const initialized = ref(false);
const trigger = ref<HTMLButtonElement>();
const history = ref<HTMLElement>();
const headingId = useId();
let previousOverflow: string | undefined;
function restorePage() {
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = undefined;
  }
}
function close() {
  if (!canLeaveVoice()) return;
  opened.value = false;
}
watch(opened, async (value) => {
  if (value) initialized.value = true;
  await nextTick();
  if (value && dialog.value && !dialog.value.open) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.value.showModal();
  } else if (!value) {
    dialog.value?.close();
    restorePage();
    trigger.value?.focus({ preventScroll: true });
  }
});
// Follow new replies only while the reader is already near the bottom.
watch(
  () => messages.value.at(-1)?.text,
  async () => {
    const list = history.value;
    if (!list || list.scrollHeight - list.scrollTop - list.clientHeight > 120)
      return;
    await nextTick();
    list.scrollTop = list.scrollHeight;
  },
  { flush: "pre" },
);
function quickPrompt(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (!select.value) return;
  draft.value = select.value;
  select.value = "";
  field.value?.focus();
}
onDeactivated(() => {
  opened.value = false;
  dialog.value?.close();
  restorePage();
});
onBeforeUnmount(restorePage);
</script>
<template>
  <section class="study-chat" aria-label="Обсуждение материала с помощником">
    <button
      ref="trigger"
      class="discussion-trigger"
      :aria-expanded="opened"
      aria-haspopup="dialog"
      @click="canLeaveVoice() && toggle()"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 11.5a8 8 0 0 1-8 8H5l-4 3 1.8-5.4A8 8 0 1 1 20 11.5Z" />
        <path d="M7 10h8M7 14h5" />
      </svg>
      Обсудить с помощником
    </button>
    <dialog
      ref="dialog"
      class="study-chat-dialog"
      :aria-labelledby="headingId"
      @cancel.prevent="close"
    >
      <div v-if="initialized" class="study-chat-panel">
        <header class="study-chat-heading">
          <div>
            <span class="platform-meta">Помощник</span>
            <h3 :id="headingId">{{ title }}</h3>
          </div>
          <button
            class="chat-close"
            aria-label="Закрыть обсуждение"
            title="Закрыть обсуждение"
            @click="close"
          >
            ×
          </button>
        </header>
        <p v-if="loading" role="status">Загружаем обсуждение…</p>
        <p v-else-if="loaded && !messages.length">
          Обсуждения пока нет. Задайте вопрос или выберите действие ниже.
        </p>
        <div
          ref="history"
          class="study-messages"
          aria-label="История обсуждения"
          tabindex="0"
          :aria-busy="busy"
        >
          <article
            v-for="(message, i) in messages"
            :key="i"
            class="study-message"
            :class="message.role"
          >
            <strong>{{ message.role === "user" ? "Вы" : "Помощник" }}</strong>
            <MarkdownContent
              v-if="message.role === 'assistant' && message.text"
              :text="message.text"
              :follow-heading="false"
            />
            <div v-else class="study-message-text">
              {{
                message.text ||
                (message.status === "pending"
                  ? "Готовит ответ…"
                  : "Ответ не получен.")
              }}
            </div>
            <small v-if="['failed', 'interrupted'].includes(message.status)"
              >Ответ не завершён</small
            >
          </article>
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
        <form @submit.prevent="canLeaveVoice() && send()">
          <label class="chat-quick-action">
            <span>Начать с</span>
            <select :disabled="busy || !loaded" @change="quickPrompt">
              <option value="">Своего вопроса</option>
              <option value="Дай небольшую подсказку, без полного решения.">
                Подсказки
              </option>
              <option value="Проверь мой ответ по критериям: ">
                Проверки ответа
              </option>
              <option
                value="Найди подходящий фрагмент в моих связанных проектах и объясни на нём этот вопрос."
              >
                Примера из проекта
              </option>
            </select>
          </label>
          <VoiceInput
            ref="field"
            v-model="draft"
            label="Ваш вопрос или ответ"
            placeholder="Напишите или надиктуйте сообщение…"
            :max-length="8000"
            :rows="3"
            :disabled="busy || !loaded"
          >
            <template #actions="{ active }">
              <button
                class="primary voice-icon"
                aria-label="Отправить"
                title="Отправить"
                :disabled="
                  active || busy || previewing || !loaded || !draft.trim()
                "
                type="submit"
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
                  <path d="M12 20V4m-7 7 7-7 7 7" />
                </svg>
              </button>
            </template>
          </VoiceInput>
          <div class="platform-actions chat-tools">
            <button
              type="button"
              :disabled="busy || previewing || !loaded || !draft.trim()"
              @click="preview"
            >
              Просмотреть задание
            </button>
            <button v-if="busy" type="button" @click="stop">Остановить</button
            ><button
              type="button"
              :disabled="loading || !!controller"
              @click="load"
            >
              Обновить обсуждение
            </button>
          </div>
          <section v-if="preparedPrompt" aria-label="Задание обсуждения">
            <h4>Задание</h4>
            <pre>{{ preparedPrompt }}</pre>
          </section>
          <p role="status">
            {{
              previewing
                ? "Подготавливаем задание…"
                : busy
                  ? "Помощник отвечает…"
                  : ""
            }}
          </p>
        </form>
      </div>
    </dialog>
  </section>
</template>
<style scoped src="./discussion.css" />
