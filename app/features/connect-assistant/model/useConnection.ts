import { ref, onMounted, onUnmounted } from "vue";
import {
  readConnection,
  startConnection,
  cancelConnection,
  renewConnection,
  removeConnection,
} from "#ui/features/connect-assistant/api/connection.ts";
export function useConnection() {
  const connection = ref<Awaited<ReturnType<typeof readConnection>> | null>(
      null,
    ),
    busy = ref(false),
    error = ref(""),
    message = ref(""),
    loginUrl = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    connection.value = await readConnection();
    clearTimeout(timer);
    if (connection.value.pending)
      timer = setTimeout(() => void run(refresh), 2000);
    else loginUrl.value = "";
  }
  async function run(action: () => Promise<void>) {
    busy.value = true;
    error.value = "";
    try {
      await action();
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : "Подключение недоступно.";
    } finally {
      busy.value = false;
    }
  }
  const start = () =>
    run(async () => {
      const result = await startConnection();
      loginUrl.value = result.url;
      await refresh();
    });
  const cancel = () =>
    run(async () => {
      await cancelConnection();
      await refresh();
    });
  const renew = () =>
    run(async () => {
      await renewConnection();
      message.value = "Сессия ChatGPT обновлена.";
      await refresh();
    });
  const disconnect = () =>
    run(async () => {
      const result = await removeConnection();
      message.value = result.message;
      await refresh();
    });
  onMounted(() => void run(refresh));
  onUnmounted(() => clearTimeout(timer));
  return {
    connection,
    busy,
    error,
    message,
    loginUrl,
    refresh: () => run(refresh),
    start,
    cancel,
    renew,
    disconnect,
  };
}
