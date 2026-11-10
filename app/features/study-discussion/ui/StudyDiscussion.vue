<script setup lang="ts">
import type { DiscussionMaterial } from "#domain/discussion/contracts.ts";
import { useDiscussion } from "#ui/features/study-discussion/model/useDiscussion.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
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
    <button :aria-expanded="opened" @click="toggle">
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
      <form @submit.prevent="send">
        <label
          >Ваш вопрос или ответ<textarea
            ref="field"
            v-model="draft"
            rows="4"
            maxlength="8000"
            :disabled="busy || !loaded"
            placeholder="Что осталось непонятно?"
          />
        </label>
        <div class="platform-actions">
          <button
            type="button"
            :disabled="busy || previewing || !loaded || !draft.trim()"
            @click="preview"
          >
            Просмотреть задание
          </button>
          <button
            class="primary"
            :disabled="busy || previewing || !loaded || !draft.trim()"
            type="submit"
          >
            Отправить</button
          ><button v-if="busy" type="button" @click="stop">Остановить</button
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
