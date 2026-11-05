import core from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";

const highlighter = core.newInstance();
for (const [name, grammar] of Object.entries({
  javascript,
  typescript,
  xml,
  css,
  json,
  bash,
})) {
  highlighter.registerLanguage(name, grammar);
}
const languages = new Map([
  ["js", "javascript"],
  ["javascript", "javascript"],
  ["jsx", "javascript"],
  ["ts", "typescript"],
  ["typescript", "typescript"],
  ["tsx", "typescript"],
  ["html", "xml"],
  ["xml", "xml"],
  ["vue", "xml"],
  ["css", "css"],
  ["json", "json"],
  ["bash", "bash"],
  ["sh", "bash"],
  ["shell", "bash"],
]);

// The string API escapes source markup. Never highlight existing HTML or infer a language.
// Large snippets remain readable/copyable without spending time tokenizing them.
export function highlightCode(source: string, info: string): string | null {
  const language = languages.get(info.trim().toLowerCase());
  if (!language || source.length > 100_000) return null;
  try {
    return highlighter.highlight(source, { language, ignoreIllegals: true })
      .value;
  } catch {
    return null;
  }
}
