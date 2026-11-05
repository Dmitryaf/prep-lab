import { test, expect, type Route } from "@playwright/test";
import assert from "node:assert/strict";
import { loadCommonKnowledge } from "../../server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
function example(title: string, marker: string) {
  const question = common.questions.find((q) => q.title === title);
  assert(question?.availableAnswer, `Missing worked solution: ${title}`);
  assert(question.criteria && question.learningLinks.length);
  const code = [...question.answer.matchAll(/```js\n([\s\S]*?)```/g)].find(
    (block) => block[1].includes(`// checked-example: ${marker}`),
  );
  assert(code, `Missing checked example: ${marker}`);
  return code[1];
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPXYAAAAASUVORK5CYII=",
  "base64",
);
// Observe real image events even for detached images; do not finish assertions
// before the deliberately late response has actually reached its load handler.
const observeImages = `
window.observedImages = []; window.observedLoads = [];
const createElement = document.createElement.bind(document);
document.createElement = (...args) => {
  const element = createElement(...args);
  if (args[0] === 'img') {
    window.observedImages.push(element);
    element.addEventListener('load', () => window.observedLoads.push(element.src));
  }
  return element;
};
`;

test("DOM wrapper changes every matched node and keeps a shared chainable API", async ({
  page,
}) => {
  await page.setContent(
    '<section><div class="item"></div><div class="item"></div></section><div id="outside"></div>',
  );
  await page.addScriptTag({
    content: example("Обёртка над DOM с цепочкой методов", "dom-wrapper"),
  });
  const result = await page.evaluate(`(() => {
    const a = $('.item'); const b = $('#outside');
    const same = a.addClass('selected').toggleClass('active').removeClass('selected')
      .css({color: 'red', paddingTop: '10px', '--accent': 'blue', 'border-width': '2px'})
      .html('<strong>ready</strong>') === a;
    return {same, sharedMethod: a.addClass === b.addClass};
  })()`);
  expect(result).toEqual({ same: true, sharedMethod: true });
  await expect(page.locator(".item.active")).toHaveCount(2);
  await expect(page.locator(".selected")).toHaveCount(0);
  await expect(page.locator(".item strong")).toHaveText(["ready", "ready"]);
  expect(
    await page.locator(".item").evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = (node as HTMLElement).style;
        return [
          style.color,
          style.paddingTop,
          style.getPropertyValue("--accent"),
          style.borderWidth,
        ];
      }),
    ),
  ).toEqual([
    ["red", "10px", "blue", "2px"],
    ["red", "10px", "blue", "2px"],
  ]);
  await expect(page.locator("#outside")).toBeEmpty();
});

test("DOM wrapper scopes queries, keeps a static selection and tolerates no matches", async ({
  page,
}) => {
  await page.setContent(
    '<section><i class="item"></i></section><i class="item"></i>',
  );
  await page.addScriptTag({
    content: example("Обёртка над DOM с цепочкой методов", "dom-wrapper"),
  });
  expect(
    await page.evaluate(`(() => {
    const root = document.querySelector('section');
    const original = $('.item', root);
    root.insertAdjacentHTML('beforeend', '<i class="item"></i>');
    original.addClass('old').toggleClass('active').toggleClass('active');
    const empty = $('.missing'); const same = empty.addClass('x').css({color: 'red'}).html('none') === empty;
    let invalid; try { $('['); } catch(error) { invalid = error.name; }
    return {same, invalid, selected: document.querySelectorAll('.old').length};
  })()`),
  ).toEqual({ same: true, invalid: "SyntaxError", selected: 1 });
  await expect(page.locator(".active")).toHaveCount(0);
});

test("image button keeps latest image when successful responses arrive in reverse order", async ({
  page,
}) => {
  const pending: Route[] = [];
  const logs: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "log") logs.push(message.text());
  });
  await page.route("https://img.example.test/**", (route) => {
    pending.push(route);
  });
  await page.setContent(
    '<button id="load">Load</button><div id="container"></div>',
  );
  await page.addScriptTag({
    content:
      observeImages + example("Кнопка загрузки изображения", "image-button"),
  });
  await page.evaluate(
    `window.disposeImage = mountImageButton(document.querySelector('#load'), document.querySelector('#container'), id => 'https://img.example.test/' + id + '.png');`,
  );
  await page.locator("#load").click();
  await expect.poll(() => pending.length).toBe(1);
  await expect(page.locator("#container")).toHaveCSS("width", "500px");
  await expect(page.locator("#container")).toHaveCSS("height", "150px");
  await expect(page.locator("#container")).toHaveCSS(
    "background-color",
    "rgb(0, 128, 0)",
  );
  await page.locator("#load").click();
  await expect.poll(() => pending.length).toBe(2);
  await pending[1]!.fulfill({ contentType: "image/png", body: png });
  await expect(page.locator("#container img")).toHaveAttribute(
    "src",
    "https://img.example.test/2.png",
  );
  await pending[0]!.fulfill({ contentType: "image/png", body: png });
  await expect.poll(() => page.evaluate("window.observedLoads.length")).toBe(2);
  await expect(page.locator("#container img")).toHaveCount(1);
  await expect(page.locator("#container img")).toHaveAttribute(
    "src",
    "https://img.example.test/2.png",
  );
  await expect.poll(() => logs).toEqual(["image loaded"]);
  await page.evaluate("window.disposeImage()");
});

test("image button shows an error, recovers on retry and ignores disposed work", async ({
  page,
}) => {
  const pending: Route[] = [];
  await page.route("https://img.example.test/**", (route) => {
    pending.push(route);
  });
  await page.setContent(
    '<button id="load">Load</button><div id="container"></div>',
  );
  await page.addScriptTag({
    content:
      observeImages + example("Кнопка загрузки изображения", "image-button"),
  });
  await page.evaluate(
    `window.disposeImage = mountImageButton(document.querySelector('#load'), document.querySelector('#container'), id => 'https://img.example.test/' + id + '.png');`,
  );
  await page.locator("#load").click();
  await expect.poll(() => pending.length).toBe(1);
  await pending[0]!.fulfill({ contentType: "image/png", body: "not an image" });
  await expect(page.locator("#container")).toHaveCSS(
    "background-color",
    "rgb(255, 0, 0)",
  );
  await expect(page.locator("#container img")).toHaveCount(0);
  await page.locator("#load").click();
  await expect.poll(() => pending.length).toBe(2);
  await pending[1]!.fulfill({ contentType: "image/png", body: png });
  await expect(page.locator("#container img")).toHaveCount(1);
  await page.locator("#load").click();
  await expect.poll(() => pending.length).toBe(3);
  await page.evaluate("window.disposeImage()");
  await pending[2]!.fulfill({ contentType: "image/png", body: png });
  await expect.poll(() => page.evaluate("window.observedLoads.length")).toBe(2);
  await page.locator("#load").click();
  expect(await page.evaluate("window.observedImages.length")).toBe(3);
  await expect(page.locator("#container img")).toHaveCount(0);
  expect(pending).toHaveLength(3);
});
