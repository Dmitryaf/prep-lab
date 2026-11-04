import { defineEventHandler } from "h3";
import { handleConnection } from "../../infrastructure/http/connection.ts";
export default defineEventHandler(async (event) => {
  await handleConnection(event.node.req, event.node.res);
});
