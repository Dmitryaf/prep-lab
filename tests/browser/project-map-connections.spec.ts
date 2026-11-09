import { test, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import type { ProjectMapNode } from "#domain/projects/map.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("map connections stay readable and arrows meet cards at every zoom", async ({
  app: { base },
  page,
}, info) => {
  const catalog = projectFixture();
  const project = catalog.projects.first;
  const nodes: ProjectMapNode[] = [
    {
      id: "root",
      label: project.name,
      kind: "system",
      description: "Приложение",
      topicIds: [],
    },
    ...["first", "second", "third"].map((id, index) => ({
      id,
      label: ["Открыть форму", "Сохранить данные", "Показать результат"][index],
      kind: "scenario" as const,
      description: "Действие пользователя",
      topicIds: ["first-main"],
    })),
    ...["Vue", "TypeScript", "SQLite"].map((label) => ({
      id: label,
      label,
      kind: "technology" as const,
      description: "Технология реализации",
      topicIds: ["first-main"],
    })),
  ];
  const edges = [
    ...nodes.slice(1).map((node) => ({
      from: "root",
      to: node.id,
      label: "Включает",
      kind: "contains" as const,
    })),
    {
      from: "first",
      to: "third",
      label: "Обновляет результат",
      kind: "flow" as const,
    },
    {
      from: "second",
      to: "third",
      label: "Сохраняет результат",
      kind: "flow" as const,
    },
  ];
  project.map = { nodes, edges };
  nodes[1].steps = [
    {
      id: "input",
      label: "Ввод данных",
      description: "Пользователь заполняет форму",
      topicIds: ["first-main"],
    },
    {
      id: "save",
      label: "Сохранение",
      description: "Приложение проверяет и сохраняет результат",
      topicIds: ["first-storage"],
    },
  ];
  project.structure = {
    nodes: nodes.slice(0, 4).map(({ steps: _steps, ...node }) => ({
      ...node,
      kind: node.id === "root" ? "system" : "module",
    })),
    edges: edges.filter((edge) =>
      ["root", "first", "second", "third"].includes(edge.to),
    ),
  };
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: catalog }),
  );
  const checkGeometry = async () => {
    const measurements = await page
      .locator(".project-map-connection")
      .evaluateAll((connections) =>
        connections.map((element) => {
          const path =
            element.querySelector<SVGPathElement>(".project-map-edge")!;
          const arrow =
            element.querySelector<SVGPathElement>(".project-map-arrow")!;
          const end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(path.getScreenCTM()!);
          const tip = arrow
            .getPointAtLength(0)
            .matrixTransform(arrow.getScreenCTM()!);
          const target = document
            .querySelector<HTMLElement>(
              `[data-map-node="${element.getAttribute("data-map-to")}"]`,
            )!
            .getBoundingClientRect();
          const onVerticalSide =
            Math.min(
              Math.abs(tip.x - target.left),
              Math.abs(tip.x - target.right),
            ) < 1 &&
            tip.y >= target.top &&
            tip.y <= target.bottom;
          const onHorizontalSide =
            Math.min(
              Math.abs(tip.y - target.top),
              Math.abs(tip.y - target.bottom),
            ) < 1 &&
            tip.x >= target.left &&
            tip.x <= target.right;
          return {
            gap: Math.hypot(end.x - tip.x, end.y - tip.y),
            touchesCard: onVerticalSide || onHorizontalSide,
          };
        }),
      );
    expect(measurements.length).toBeGreaterThan(0);
    for (const measurement of measurements) {
      expect(measurement.gap).toBeLessThan(0.1);
      expect(measurement.touchesCard).toBe(true);
    }
  };
  for (const view of ["scenarios", "technologies", "structure"]) {
    await page.goto(base + "/#/projects?project=first&mapView=" + view);
    await page.locator("[data-map-node]").first().waitFor();
    await expect(page.locator(".project-map-node-kind")).toHaveCount(0);
    await expect(page.locator(".project-map-canvas marker")).toHaveCount(0);
    if (view === "scenarios") {
      await expect(page.locator(".project-map-canvas")).toHaveCount(0);
      const selected = page.locator('[data-map-node="third"]');
      const before = await selected.boundingBox();
      await selected.click();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      expect(await selected.boundingBox()).toEqual(before);
      const panel = page.getByRole("complementary", {
        name: "Выбранный элемент карты",
      });
      await panel.getByRole("tab", { name: "Связи", exact: true }).click();
      expect(
        (await panel.innerText()).split("Показать результат"),
      ).toHaveLength(2);
      await page.locator('[data-map-node="first"]').click();
      await panel.getByRole("button", { name: /Показать сценарий/ }).click();
      await page.locator('[data-map-node="first/step/input"]').waitFor();
      await expect(page.locator(".project-map-viewport")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    } else if (view === "technologies") {
      await expect(page.locator(".project-map-canvas")).toHaveCount(0);
      await expect(page.locator(".map-overview-card")).toHaveCount(3);
      continue;
    } else if (view === "structure") {
      const selected = page.locator('[data-map-node="third"]');
      await selected.click();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".project-map-connection")).toHaveCount(2);
    }
    await page.getByRole("button", { name: "Сбросить масштаб карты" }).click();
    await expect(
      page.getByRole("button", { name: "Сбросить масштаб карты" }),
    ).toHaveText("100%");
    await checkGeometry();
    for (const [action, percent] of [
      ["Увеличить карту", "120%"],
      ["Уменьшить карту", "100%"],
      ["Уменьшить карту", "80%"],
    ]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Сбросить масштаб карты" }),
      ).toHaveText(percent);
      await checkGeometry();
    }
    if (view === "scenarios") {
      const canvas = page.locator(".project-map-canvas");
      const viewport = page.locator(".project-map-viewport");
      await viewport.focus();
      await page.keyboard.press("ArrowRight");
      const transform = await canvas.getAttribute("style");
      await page.locator('[data-map-node="first/step/input"]').click();
      await expect(
        page.locator('[data-map-node="first/step/input"]'),
      ).toHaveAttribute("aria-pressed", "true");
      expect(await canvas.getAttribute("style")).toBe(transform);
      await page
        .getByRole("link", { name: "Открыть разбор", exact: false })
        .click();
      await expect(page.locator(".topic-title")).toHaveText(
        "Контракт операции",
      );
      await page
        .getByRole("button", { name: "← К карте проекта", exact: true })
        .click();
      await expect(
        page.locator('[data-map-node="first/step/input"]'),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(canvas).toHaveAttribute("style", transform!);
      await page
        .getByRole("button", { name: "Вместить схему", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Развернуть карту", exact: true })
        .click();
      await expect(page.locator(".project-map")).toHaveClass(/is-fullscreen/);
      await page
        .getByRole("button", { name: "Свернуть карту", exact: true })
        .click();
      await expect(page.locator(".project-map")).not.toHaveClass(
        /is-fullscreen/,
      );
    }
    await page.screenshot({ path: info.outputPath(view + ".png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await checkGeometry();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
