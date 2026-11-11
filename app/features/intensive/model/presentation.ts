const plural = new Intl.PluralRules("ru");

export function questionCount(count: number) {
  const form = plural.select(count);
  return `${count} ${form === "one" ? "вопрос" : form === "few" ? "вопроса" : "вопросов"}`;
}
