// Presentation compatibility for editorial wording shipped in older notes and
// interview snapshots. Keep this list narrow: technical uses of "источник",
// failure/recovery explanations and the stored Markdown must remain intact.
const editorialSentences = [
  "Источник доступности сверён 2026-09-24.",
  "Учебная адаптация публичного задания; использование компанией не подтверждено.",
  "Учебный кейс: источник конкретного интервью-задания не подтверждён.",
  "Сохранён для чтения и прежней истории; в новые интервью не включается.",
  "Документ из банка помечен AVITO; его подлинность и актуальность не подтверждены компанией.",
  "Основной сценарий взят из задания, подробный разбор, проверки и дополнительные условия ниже разработаны для этой платформы.",
  "Источник помечен AVITO; подлинность и актуальность не подтверждены компанией.",
  "Условие ниже сохранено по смыслу; решение и правила для конкурирующих загрузок разработаны платформой.",
  "Источник помечен AVITO; подтверждения подлинности или актуальности компанией нет.",
  "Контракт цепочки взят из задания; объяснение, проверки и поддержка области поиска ниже самостоятельные.",
  "Файл находится в разделе AVITO предоставленного банка; компания не подтверждала его подлинность или актуальность.",
  "Правило участия и примеры взяты из условия; реализация и договорённости о граничных случаях ниже самостоятельные.",
  "Контракты взяты из предоставленного банка.",
  "Ошибочный код для ревью, уточнения и исправленные решения созданы этой платформой: они не выдаются за оригинальный код интервьюера.",
  "Маркировка AVITO в выгрузке не подтверждает её подлинность или актуальность компанией.",
  "Исходное задание просит реализацию; следующий код создан платформой специально для ревью по этому контракту.",
  "Использование такого кода на реальном интервью не подтверждено.",
  "Следующий ошибочный код создан платформой для ревью, а не скопирован как реальный код интервьюера.",
  "Компания не подтверждала применение этого примера.",
];

function cleanProse(text: string) {
  return editorialSentences.reduce(
    (result, sentence) => result.replaceAll(sentence, ""),
    text,
  );
}

export function cleanEditorialNotes(text: string): string {
  let fence: { marker: string; length: number; quoteDepth: number } | null =
    null;
  let hiddenSection: { level: number; quoteDepth: number } | null = null;
  return text
    .split(/(\r\n|\n|\r)/)
    .map((line, index) => {
      if (index % 2) return line;
      const [, prefix, body] = line.match(/^([ \t]*(?:>[ \t]*)*)(.*)$/)!;
      const quoteDepth = (prefix!.match(/>/g) ?? []).length;
      if (hiddenSection && quoteDepth < hiddenSection.quoteDepth)
        hiddenSection = null;
      // A fenced block inside a quote ends with that quote's container.
      if (fence && quoteDepth < fence.quoteDepth) fence = null;
      const marker = body!.match(/^(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (
          marker &&
          quoteDepth === fence.quoteDepth &&
          marker[1]![0] === fence.marker &&
          marker[1]!.length >= fence.length &&
          !marker[2]!.trim()
        )
          fence = null;
        return hiddenSection ? prefix! : line;
      }
      if (marker) {
        fence = {
          marker: marker[1]![0]!,
          length: marker[1]!.length,
          quoteDepth,
        };
        return hiddenSection ? prefix! : line;
      }
      const heading = body!.match(/^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (
        hiddenSection &&
        heading &&
        quoteDepth === hiddenSection.quoteDepth &&
        heading[1]!.length <= hiddenSection.level
      )
        hiddenSection = null;
      if (
        !hiddenSection &&
        heading &&
        /^(?:Источник|Источники|Происхождение|Атрибуция|Старые источники)$/.test(
          heading[2]!,
        )
      )
        hiddenSection = { level: heading[1]!.length, quoteDepth };
      if (hiddenSection) return prefix!;
      if (
        /^(?:\*\*)?(?:Тип источника|Источник задания|Происхождение|Допуск к интервью|Формат раунда|Этап кода):(?:\*\*)?(?:\s|$)/.test(
          body!,
        )
      )
        return prefix!;
      // Protect inline code too, including spans delimited by multiple ticks.
      let end = 0;
      let cleaned = "";
      for (const match of body!.matchAll(/(`+)(.*?)\1/g)) {
        cleaned += cleanProse(body!.slice(end, match.index)) + match[0];
        end = match.index + match[0].length;
      }
      cleaned += cleanProse(body!.slice(end));
      return cleaned === body ? line : prefix + cleaned.trim();
    })
    .join("");
}
