<script setup lang="ts">
import type { DiscussionMaterial } from "../../../../domain/discussion/contracts.ts";
import { useDiscussion } from "../model/useDiscussion.ts";
const props = defineProps<DiscussionMaterial>();
const {
  opened,
  messages,
  draft,
  error,
  busy,
  loading,
  loaded,
  field,
  controller,
  load,
  toggle,
  send,
  stop,
} = useDiscussion(props);
</script>
<template>
  <section class="study-chat" aria-label="Обсуждение материала с Codex">
    <button :aria-expanded="opened" @click="toggle">
      {{ opened ? "Свернуть обсуждение" : "Разобраться с Codex" }}
    </button>
    <div v-if="opened" class="study-chat-panel">
      <h3>Codex · {{ title }}</h3>
      <p class="platform-muted">
        Сообщения и материал отправляются в Codex через ваш аккаунт ChatGPT;
        действуют лимиты подписки. История хранится в вашем экземпляре Frontend
        Lab.
      </p>
      <details>
        <summary>Какой контекст получит Codex</summary>
        <pre>{{ context }}</pre>
      </details>
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
          <strong>{{ message.role === "user" ? "Вы" : "Codex" }}</strong>
          <pre>{{
            message.text ||
            (message.status === "pending"
              ? "Готовит ответ…"
              : "Ответ не получен.")
          }}</pre>
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
            class="primary"
            :disabled="busy || !loaded || !draft.trim()"
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
        <p role="status">{{ busy ? "Codex отвечает…" : "" }}</p>
      </form>
    </div>
  </section>
</template>
<style scoped src="./discussion.css" />
