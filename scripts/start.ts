import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.PORT ||= "4173";
process.env.HOST ||= "127.0.0.1";
await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
