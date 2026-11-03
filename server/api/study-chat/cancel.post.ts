import { defineEventHandler } from "h3";
import { discussions } from "../../application/discussions.ts";
export default defineEventHandler(async (event) => {
  await discussions.handle(event.node.req, event.node.res);
});
