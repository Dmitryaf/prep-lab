// A deliberately non-executable Markdown subset for local study notes.
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );
export const headingId = (title: unknown) =>
  "h-" + encodeURIComponent(String(title).replace(/`/g, "").trim());
const safeHref = (value: unknown) =>
  typeof value === "string" && /^(?:https?:\/\/|#)/i.test(value) ? value : null;
export function renderMarkdown(
  text: unknown,
  {
    resolveLink,
  }: { resolveLink?: (target: string, label: string) => string | null } = {},
) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "")
    .split(/\r?\n/);
  function inline(value: string) {
    const tokens: string[] = [];
    const token = (html: string) => {
      tokens.push(html);
      return "\u0000" + (tokens.length - 1) + "\u0000";
    };
    const unavailable = (label: string) =>
      `<span class="unavailable-link" title="Материал или раздел не найден в доступном учебном каталоге">${escapeHtml(label)}<small> — недоступно в учебном каталоге</small></span>`;
    // eslint-disable-next-line no-control-regex -- Deliberate control-character rejection or internal Markdown sentinel.
    let s = String(value).replace(/\u0000/g, "");
    s = s.replace(/`([^`]+)`/g, (_, v) =>
      token(`<code>${escapeHtml(v)}</code>`),
    );
    s = s.replace(/!?\[\[([^\]]+)\]\]/g, (_, raw) => {
      const [target, label] = raw.replace(/\\\|/g, "|").split("|");
      const title = label || target.split("#").at(-1)!.split("/").at(-1);
      const href = safeHref(
        resolveLink
          ? resolveLink(target, title)
          : target.startsWith("#")
            ? "#" + headingId(target.slice(1))
            : null,
      );
      return token(
        href
          ? `<a href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
          : unavailable(title),
      );
    });
    s = s.replace(/!?\[([^\]]+)\]\((<[^>]+>|[^)]+)\)/g, (_, label, raw) => {
      const target = raw
        .trim()
        .replace(/^<|>$/g, "")
        .replace(/\s+["'][^"']*["']$/, "");
      const href = safeHref(
        /^https?:/i.test(target)
          ? target
          : resolveLink
            ? resolveLink(target, label)
            : target.startsWith("#")
              ? "#" + headingId(target.slice(1))
              : null,
      );
      return token(
        href
          ? `<a href="${escapeHtml(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(label)}</a>`
          : unavailable(label),
      );
    });
    return (
      escapeHtml(s)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
        // eslint-disable-next-line no-control-regex -- Deliberate control-character rejection or internal Markdown sentinel.
        .replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)])
    );
  }
  function tableCells(line: string) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((v) => v.trim().replace(/\\\|/g, "|"));
  }
  let html = "",
    i = 0;
  const headingStack: { level: number; title: string }[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const code = [];
      i++;
      while (
        i < lines.length &&
        !new RegExp(
          "^\\s*" + fence[1][0] + "{" + fence[1].length + ",}\\s*$",
        ).test(lines[i])
      )
        code.push(lines[i++]);
      if (i < lines.length) i++;
      html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
      continue;
    }
    if (/^>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>/.test(lines[i]))
        quote.push(lines[i++].replace(/^> ?/, ""));
      const callout = /^\[!([\w-]+)\]([+-]?)(.*)$/.exec(quote[0]);
      if (callout) {
        const body = renderMarkdown(quote.slice(1).join("\n"), { resolveLink });
        const label =
          callout[3].trim() ||
          (
            {
              answer: "Ответ",
              example: "Разбор",
              question: "Проверка себя",
              abstract: "Содержание",
              note: "Примечание",
              summary: "Кратко",
            } as Record<string, string>
          )[callout[1]] ||
          callout[1];
        html +=
          callout[2] || /^(answer|example|question)$/.test(callout[1])
            ? `<details class="md-callout"><summary>${inline(label)}</summary>${body}</details>`
            : `<aside class="md-callout"><strong>${inline(label)}</strong>${body}</aside>`;
      } else
        html += `<blockquote>${renderMarkdown(quote.join("\n"), { resolveLink })}</blockquote>`;
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (h) {
      while (headingStack.length && headingStack.at(-1)!.level >= h[1].length)
        headingStack.pop();
      headingStack.push({ level: h[1].length, title: h[2] });
      const aliases = new Set([
        headingStack.map((v) => v.title).join("#"),
        headingStack
          .filter((v) => v.level > 1)
          .map((v) => v.title)
          .join("#"),
      ]);
      aliases.delete(h[2]);
      aliases.delete("");
      html += [...aliases]
        .map((a) => `<span id="${escapeHtml(headingId(a))}"></span>`)
        .join("");
      html += `<h${h[1].length} id="${escapeHtml(headingId(h[2]))}">${inline(h[2])}</h${h[1].length}>`;
      i++;
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || "")) {
      const header = tableCells(line);
      i += 2;
      html += `<div class="md-table"><table><thead><tr>${header.map((v) => `<th>${inline(v)}</th>`).join("")}</tr></thead><tbody>`;
      while (i < lines.length && /^\s*\|/.test(lines[i]))
        html += `<tr>${tableCells(lines[i++])
          .map((v) => `<td>${inline(v)}</td>`)
          .join("")}</tr>`;
      html += "</tbody></table></div>";
      continue;
    }
    if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\./.test(line),
        tag = ordered ? "ol" : "ul";
      html += `<${tag}>`;
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\. / : /^\s*[-*+] /).test(lines[i])
      )
        html += `<li>${inline(lines[i++].replace(/^\s*(?:[-*+] |\d+\. )/, ""))}</li>`;
      html += `</${tag}>`;
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      html += "<hr>";
      i++;
      continue;
    }
    const paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:#{1,6} |>|\s*```|\s*~~~|\s*\||\s*[-*+] |\s*\d+\. )/.test(lines[i])
    )
      paragraph.push(lines[i++]);
    html += `<p>${inline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`;
  }
  return html;
}
