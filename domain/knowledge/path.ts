// Only the two historical directory spellings are aliases. Other mistakes stay errors.
export function canonicalNotePath(value: string = "") {
  return value
    .replace(/\\/g, "/")
    .replace(/\.md(?=#|$)/i, "")
    .replace(/^Фронтенд\/Javascript(?=\/|$)/, "Фронтенд/JavaScript")
    .replace(/^Фронтенд\/Typescript(?=\/|$)/, "Фронтенд/TypeScript");
}
