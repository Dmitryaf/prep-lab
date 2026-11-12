import { defineEventHandler } from "h3";
import { createSpeechHandler } from "#server/infrastructure/speech/http.ts";
const handle = createSpeechHandler();
export default defineEventHandler(async (event) => {
  await handle(event.node.req, event.node.res);
});
