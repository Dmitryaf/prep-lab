<script setup lang="ts">
import { useConnection } from "#ui/features/connect-assistant/model/useConnection.ts";
const {
  connection,
  busy,
  error,
  message,
  loginUrl,
  refresh,
  start,
  cancel,
  renew,
  disconnect,
} = useConnection();
</script>
<template>
  <section
    class="assistant-connection"
    aria-labelledby="assistantConnectionTitle"
  >
    <h2 id="assistantConnectionTitle">Подключение помощника</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="connection">
      <p>
        {{
          connection.connected
            ? "ChatGPT подключён к этому экземпляру Prep Lab."
            : "Подключите ChatGPT, чтобы обсуждать материалы и готовить разборы."
        }}
      </p>
      <p v-if="connection.active">
        Выполняется запрос. Его можно отменить в открытом обсуждении или
        задании.
      </p>
      <p v-if="connection.needsRefresh">
        Сессия требует обновления. Оно также выполняется перед следующим
        запросом.
      </p>
      <p v-if="connection.message">{{ connection.message }}</p>
      <div class="platform-actions">
        <button
          v-if="connection.localLoginAvailable && !connection.pending"
          type="button"
          :disabled="busy || connection.active"
          data-oai-siwc-button
          @click="start"
        >
          Продолжить с ChatGPT
        </button>
        <a
          v-if="loginUrl"
          :href="loginUrl"
          target="_blank"
          rel="noreferrer noopener"
          data-oai-siwc-button
          >Открыть вход ChatGPT</a
        >
        <button
          v-if="connection.pending"
          type="button"
          :disabled="busy"
          @click="cancel"
        >
          Отменить вход
        </button>
        <button type="button" :disabled="busy" @click="refresh">
          Обновить состояние подключения
        </button>
        <button
          v-if="connection.connected"
          type="button"
          :disabled="busy || connection.active"
          @click="renew"
        >
          Обновить сессию ChatGPT
        </button>
      </div>
      <p>
        Ответы используют лимиты вашего плана ChatGPT. Вход и просмотр состояния
        не отправляют запросы модели.
      </p>
      <details v-if="!connection.localLoginAvailable">
        <summary>Как подключить ChatGPT</summary>
        <p>
          Владелец экземпляра выполняет отдельный вход Prep Lab локальным
          помощником на компьютере браузера. Если приложение работает на
          удалённом сервере, защищённое подключение затем переносится на него.
        </p>
        <p>
          Инструкция находится в <code>docs/assistant-connection.md</code> из
          поставки. Токены не нужно вставлять в браузер или сообщения.
        </p>
      </details>
      <details v-if="connection.connected">
        <summary>Отключить ChatGPT</summary>
        <p>
          Текущая сессия будет отозвана, а её токены удалены с этого экземпляра.
          Материалы и истории останутся доступны.
        </p>
        <button
          type="button"
          :disabled="busy || connection.active"
          @click="disconnect"
        >
          Подтвердить отключение ChatGPT
        </button>
      </details>
    </template>
  </section>
</template>
