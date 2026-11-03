import { createHash } from "node:crypto";
import { resolve } from "node:path";
// Identify this checkout without exposing its absolute filesystem path.
export const workspaceId = createHash("sha256")
  .update(resolve(process.cwd()).toLowerCase())
  .digest("hex");
