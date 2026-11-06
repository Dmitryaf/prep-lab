import { z } from "zod";
import { projectsSchema, topicSchema } from "./contracts.ts";

export const projectCatalogSchema = z
  .object({
    projects: projectsSchema,
    topics: z.array(topicSchema),
    defaultProject: z.string().optional(),
    defaultRoute: z.string().optional(),
    codeHighlights: z.record(z.string(), z.array(z.string())),
    repositories: z.record(
      z.string(),
      z.url().refine((value) => value.startsWith("https://")),
    ),
    sourceLabels: z.record(
      z.string(),
      z.array(z.object({ prefix: z.string(), label: z.string() })),
    ),
    experience: z
      .record(
        z.string(),
        z.object({
          kind: z.enum(["personal", "commercial"]),
          notice: z.string().optional(),
        }),
      )
      .default({}),
  })
  .superRefine((catalog, context) => {
    const ids = new Set<string>();
    if (
      catalog.defaultProject &&
      !Object.hasOwn(catalog.projects, catalog.defaultProject)
    )
      context.addIssue({
        code: "custom",
        message: "Неизвестный проект по умолчанию.",
      });
    if (
      catalog.defaultRoute &&
      !Object.values(catalog.projects).some((project) =>
        project.routes.some((route) => route.id === catalog.defaultRoute),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Неизвестный маршрут по умолчанию.",
      });
    for (const topic of catalog.topics) {
      if (ids.has(topic.id) || !Object.hasOwn(catalog.projects, topic.project))
        context.addIssue({
          code: "custom",
          message: "Повтор темы или неизвестный проект: " + topic.id,
        });
      ids.add(topic.id);
    }
    for (const project of Object.values(catalog.projects)) {
      const projectTopics = new Set(
        catalog.topics
          .filter((topic) => topic.project === project.id)
          .map((topic) => topic.id),
      );
      for (const node of [
        ...(project.map?.nodes || []),
        ...(project.structure?.nodes || []),
      ]) {
        if (node.topicIds.some((id) => !projectTopics.has(id)))
          context.addIssue({
            code: "custom",
            message: "Карта ссылается на неизвестную тему проекта.",
          });
      }
      for (const route of project.routes)
        if (route.nodes.some((id) => !ids.has(id)))
          context.addIssue({
            code: "custom",
            message: "Маршрут ссылается на неизвестную тему.",
          });
    }
  });
export type ProjectCatalog = z.infer<typeof projectCatalogSchema>;
export const emptyProjectCatalog = (): ProjectCatalog => ({
  projects: {},
  topics: [],
  codeHighlights: {},
  repositories: {},
  sourceLabels: {},
  experience: {},
});
