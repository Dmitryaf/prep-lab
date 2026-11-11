import test from "node:test";
import assert from "node:assert/strict";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import {
  knowledgeForProfile,
  supportsQuestion,
} from "#domain/knowledge/profile.ts";
import { headings } from "#domain/knowledge/markdown.ts";
import { compileKnowledge } from "#domain/knowledge/catalog.ts";
import { selectInterview, dailySession } from "#domain/interview/selection.ts";
import { loadState, validateState } from "#domain/interview/saved-state.ts";

const common = loadCommonKnowledge();
test("the complete common base contains no owner materials and retains stable question identities", () => {
  assert.equal(common.notes.length, 219);
  assert.equal(common.questions.length, 582);
  assert.equal(
    new Set(common.questions.map((question) => question.id)).size,
    582,
  );
  assert(
    !/Dmitryaf|МЭДО|Inbox Point|Trajectory|Landocs|Docshouse|cokr/i.test(
      JSON.stringify(common),
    ),
  );
});
for (const profile of ["vue", "react"] as const) {
  test(`${profile}: core routes, answers, criteria and live material links remain usable`, () => {
    const bank = knowledgeForProfile(common, profile);
    assert.equal(bank.route.length, 62);
    assert(bank.questions.length > 400);
    for (const id of bank.route) {
      const question = bank.questions.find((question) => question.id === id)!;
      assert(question?.answer && question.criteria, id);
      assert(supportsQuestion(question, profile), id);
      assert(
        question.learningLinks.some((link) => link.kind === "theory"),
        "No theory: " + id,
      );
      for (const link of question.learningLinks) {
        const note = bank.notes.find((note) => note.id === link.noteId);
        assert(note, "Unavailable core material: " + id + " → " + link.noteId);
        assert(
          !link.heading ||
            headings(note.markdown).some(
              (heading) => heading.title === link.heading,
            ),
          "Missing core anchor: " + id + " → " + link.heading,
        );
      }
    }
    // References in common prose are useful context; executable foreign examples
    // and dedicated foreign lessons are not part of the selected stack.
    const forbidden =
      profile === "react"
        ? /\bVue\b|\bVuex\b|\bPinia\b|\.vue\b|from ['"]vue['"]/
        : /\bReact\b|\bRedux\b|\buseEffect\b|from ['"]react['"]/;
    for (const note of bank.notes) {
      assert.notEqual(note.category, profile === "react" ? "Vue" : "React");
      for (const block of note.markdown.matchAll(/```[^\n]*\n[\s\S]*?```/g)) {
        assert(!forbidden.test(block[0]), note.id);
      }
      const fences = note.markdown.match(/^\s*```/gm) || [];
      assert.equal(fences.length % 2, 0, "Broken code fence: " + note.id);
    }
    for (let day = 0; day < 90; day++) {
      for (const kind of ["daily", "full"] as const) {
        const questions = selectInterview(
          bank.questions,
          kind,
          String(day),
          [],
          {},
          profile,
        );
        assert.equal(questions.length, kind === "daily" ? 11 : 20);
        assert(
          questions.filter(
            (question) =>
              question.category === (profile === "react" ? "React" : "Vue") &&
              question.kind === "theory",
          ).length >= (kind === "daily" ? 2 : 3),
        );
        assert(
          questions.every((question) => supportsQuestion(question, profile)),
        );
        assert(questions.every((question) => question.source !== "projects"));
      }
    }
  });
}
test("changing profile creates a separate daily selection without rebuilding an existing snapshot", () => {
  const blank = loadState({ getItem: () => null });
  const vue = dailySession(
    blank,
    knowledgeForProfile(common, "vue").questions,
    "2026-11-03",
    "vue",
  );
  const original = structuredClone(vue.daily["2026-11-03"]);
  const react = dailySession(
    vue,
    knowledgeForProfile(common, "react").questions,
    "2026-11-03",
    "react",
  );
  assert.deepEqual(react.daily["2026-11-03"], original);
  assert.equal(react.daily["2026-11-03:react"].profile, "react");
  assert.deepEqual(validateState(react), react);
  assert.equal(dailySession(react, [], "2026-11-03", "vue"), react);
});

test("shared explanations and map anchors survive optional framework references", () => {
  const markdown = `# Browser toolkit

A shared introduction compares React and Vue without requiring either framework.

| Area | Reading |
| --- | --- |
| Events | [[shared#Events|Events]] |
| Optional | [[vue|Vue]], [[react|React]] |

## Events

Observers work with DOM; Vue and React components can both own their lifetime.

> [!answer]- Answer
>
> Disconnect observers when their owner disappears.

## Vue component

\`\`\`vue
<script setup>import { ref } from 'vue';</script>
\`\`\`

## Practice

Predict the sequence, implement cleanup, and check that no callback runs after disposal.
`;
  const base = compileKnowledge([
    {
      id: "shared",
      path: "Собеседования/Темы/Общее.md",
      title: "Browser toolkit",
      category: "Браузер, HTML и CSS",
      markdown,
    },
  ]);
  const original = structuredClone(base);
  const bank = knowledgeForProfile(base, "react");
  const note = bank.notes[0];
  assert(note);
  assert.match(note.markdown, /A shared introduction/);
  assert.match(note.markdown, /\| Events \|/);
  assert.match(note.markdown, /Observers work with DOM/);
  assert(
    headings(note.markdown).some((heading) => heading.title === "Practice"),
  );
  assert.doesNotMatch(note.markdown, /<script setup>/);
  assert.equal(bank.questions[0]?.id, "ck:shared#Events");
  assert.deepEqual(
    base,
    original,
    "profile selection must not rewrite source or historical snapshots",
  );
});

test("shared browser and JavaScript competencies remain available in both profiles", () => {
  for (const profile of ["vue", "react"] as const) {
    const bank = knowledgeForProfile(common, profile);
    for (const title of [
      "Для чего нужны Proxy и Reflect?",
      "Когда нужны MutationObserver, ResizeObserver и IntersectionObserver?",
      "Как безопасно вставить пользовательский текст?",
      "Как управлять CSS в большом приложении?",
    ]) {
      const source = common.questions.find(
        (question) => question.title === title,
      )!;
      assert(
        bank.questions.some((question) => question.id === source.id),
        `${profile}: ${title}`,
      );
      const note = bank.notes.find((note) => note.id === source.noteId)!;
      assert(
        headings(note.markdown).some((heading) => heading.title === title),
      );
    }
  }
});

test("profile restrictions still reject required foreign code and explicit source profiles", () => {
  const question = {
    id: "foreign-example",
    title: "Render a counter",
    prompt: "Implement the following component",
    answer: "```jsx\nimport { useState } from 'react';\n```",
    kind: "practice",
    source: "knowledge",
    category: "Браузер, HTML и CSS",
  };
  assert.equal(supportsQuestion(question, "vue"), false);
  assert.equal(
    supportsQuestion(
      { ...question, answer: "A shared explanation", profiles: ["react"] },
      "vue",
    ),
    false,
  );
  assert.equal(
    supportsQuestion(
      { ...question, answer: "A shared explanation", category: "React" },
      "vue",
    ),
    false,
  );
  assert.equal(
    supportsQuestion(
      {
        ...question,
        answer: "~~~vue\n<template><button>Counter</button></template>\n~~~",
      },
      "react",
    ),
    false,
  );
});

test("a dedicated foreign lesson and explicit profile restriction remain hidden even without code", () => {
  const notes = [
    {
      id: "foreign-title",
      path: "Фронтенд/Разное/Компоненты.md",
      title: "Vue component lifecycle",
      category: "Инженерные вопросы",
      markdown:
        "# Vue component lifecycle\n\nMount and unmount describe the lifetime of a component instance.",
    },
    {
      id: "restricted",
      path: "Фронтенд/Разное/Секрет.md",
      title: "Restricted",
      category: "Инженерные вопросы",
      profiles: ["vue" as const],
      markdown:
        "# Restricted\n\nThis note is explicitly assigned to one stack by the source author.",
    },
  ];
  const bank = knowledgeForProfile(
    { notes, questions: [], route: [], warnings: [] },
    "react",
  );
  assert.deepEqual(bank.notes, []);
});
