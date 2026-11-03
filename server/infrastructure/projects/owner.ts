import { readProjectCatalog } from "./catalog.ts";

// Explicit local validation input; the production API reads the package per request.
export const ownerCatalog = readProjectCatalog();
export const { projects, topics } = ownerCatalog;
