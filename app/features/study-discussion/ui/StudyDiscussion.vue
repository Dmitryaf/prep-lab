<script setup lang="ts">
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
</script>
<template>
  <section class="study-chat" aria-label="Обсуждение материала с помощником">
    <button :aria-expanded="opened" @click="canLeaveVoice() && toggle()">
      {{ opened ? "Свернуть обсуждение" : "Обсудить с помощником" }}
    </button>
    <div v-if="opened" class="study-chat-panel">
      <h3>Помощник · {{ title }}</h3>
      <p v-if="loading" role="status">Загружаем обсуждение…</p>
      <p v-else-if="loaded && !messages.length">
        Обсуждения пока нет. Задайте вопрос или выберите действие ниже.
      </p>
      <div
        class="study-messages"
        aria-label="История обсуждения"
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
      <div class="platform-actions">
        <button
          :disabled="busy || !loaded"
          @click="
            draft = 'Дай небольшую подсказку, без полного решения.';
            field?.focus();
          "
        >
          Дай подсказку
        </button>
        <button
          :disabled="busy || !loaded"
          @click="
            draft = 'Проверь мой ответ по критериям: ';
            field?.focus();
          "
        >
          Проверь мой ответ
        </button>
        <button
          :disabled="busy || !loaded"
          @click="
            draft =
              'Объясни на примере связанного проекта. Отделяй прочитанный код от предположений.';
            field?.focus();
          "
        >
          Пример из проекта
        </button>
      </div>
      <form @submit.prevent="canLeaveVoice() && send()">
        <VoiceInput
          ref="field"
          v-model="draft"
          label="Ваш вопрос или ответ"
          placeholder="Напишите или надиктуйте сообщение…"
          :max-length="8000"
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
        <div class="platform-actions">
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
  </section>
</template>
<style scoped src="./discussion.css" />
