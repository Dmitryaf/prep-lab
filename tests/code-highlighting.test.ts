import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";

function plainMarkup(html: string) {
  return html.replace(/<\/?span\b[^>]*>/g, "");
}

test("fenced frontend code receives syntax tokens without changing its escaped text", () => {
  const source =
    'const message: string = "<button>&</button>";\n// комментарий\nconsole.log(message);';
  const html = renderMarkdown(`\`\`\`ts\n${source}\n\`\`\``);
  assert.match(html, /class="hljs-keyword"/);
  assert.match(html, /class="hljs-string"/);
  assert.match(html, /class="hljs-comment"/);
  assert.match(
    plainMarkup(html),
    /const message: string = &quot;&lt;button&gt;&amp;&lt;\/button&gt;&quot;;\n\/\/ комментарий\nconsole.log\(message\);/,
  );
});

test("markup examples remain inert; malicious fence language never becomes an attribute", () => {
  const html = renderMarkdown(
    '```html\n<img src=x onerror="alert(1)"><script>alert(2)</script>\n```',
  );
  assert.match(html, /hljs-tag/);
  assert.doesNotMatch(html, /<(?:img|script)\b/);
  assert.match(
    plainMarkup(html),
    /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;/,
  );
  const malicious = renderMarkdown(
    '```js" onclick="alert(1)\nconst x = "<svg>";\n```',
  );
  assert.doesNotMatch(malicious, /onclick|hljs/);
  assert.match(malicious, /&lt;svg&gt;/);
});

test("unknown languages and prose fences stay plain and large code is retained without tokenization", () => {
  for (const language of ["", "text", "unknown", "constructor"]) {
    const html = renderMarkdown(
      `\`\`\`${language}\nconst x = '<tag>';\n\`\`\``,
    );
    assert.doesNotMatch(html, /hljs/);
    assert.match(html, /&lt;tag&gt;/);
  }
  const code = "const long = 1;\n".repeat(8000);
  const html = renderMarkdown(`\`\`\`js\n${code}\`\`\``);
  assert.doesNotMatch(html, /hljs/);
  assert.equal((html.match(/const long/g) || []).length, 8000);
});

test("JSX, TSX, Vue markup, CSS, JSON and shell aliases are explicitly supported", () => {
  for (const [language, source] of [
    ["jsx", 'const greeting = <h1 title="hello">Hello</h1>;'],
    ["tsx", 'const name: string = "Hello";'],
    ["vue", '<template><button @click="save">Save</button></template>'],
    ["css", "button { color: red; }"],
    ["json", '{"name": "value", "count": 2}'],
    ["sh", 'echo "$HOME"'],
  ]) {
    assert.match(
      renderMarkdown(`\`\`\`${language}\n${source}\n\`\`\``),
      /class="hljs-/,
      language,
    );
  }
});
