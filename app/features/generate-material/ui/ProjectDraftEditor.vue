<script setup lang="ts">
import type { ProjectDraft } from "../../../../domain/projects/draft.ts";
import type { PromptInput } from "../../../../domain/prompts/contracts.ts";
const draft = defineModel<ProjectDraft>({ required: true });
defineProps<{ disabled: boolean; materials: PromptInput["materials"] }>();
function mechanism(index: number, event: Event) {
  draft.value.topics[index].mechanism = (
    event.target as HTMLTextAreaElement
  ).value.split("\n");
}
</script>
<template>
  <section aria-label="Проектный разбор">
    <label for="draftProjectName">Название проекта</label
    ><input id="draftProjectName" v-model="draft.name" :disabled="disabled" />
    <label for="draftProjectSummary">Описание проекта</label
    ><textarea
      id="draftProjectSummary"
      v-model="draft.summary"
      rows="4"
      :disabled="disabled"
    />
    <h3>Факты о роли</h3>
    <p v-if="!draft.roleFacts.length">
      Подтверждённых фактов о личной роли пока нет.
    </p>
    <article v-for="(fact, index) in draft.roleFacts" :key="index">
      <label :for="'roleFact-' + index">Факт {{ index + 1 }}</label
      ><textarea
        :id="'roleFact-' + index"
        v-model="fact.text"
        rows="3"
        :disabled="disabled"
      />
      <label :for="'factBasis-' + index">Основание факта {{ index + 1 }}</label
      ><select
        :id="'factBasis-' + index"
        v-model="fact.basis"
        :disabled="disabled"
      >
        <option value="user_statement">Рассказ пользователя</option>
        <option value="document">Документ</option>
      </select>
      <label v-if="fact.basis === 'document'" :for="'factSource-' + index"
        >Документ для факта {{ index + 1 }}</label
      ><select
        v-if="fact.basis === 'document'"
        :id="'factSource-' + index"
        v-model="fact.sourceId"
        :disabled="disabled"
      >
        <option :value="null">Выберите документ</option>
        <option
          v-for="material in materials"
          :key="material.id"
          :value="material.id"
        >
          {{ material.path }}
        </option>
      </select>
      <button :disabled="disabled" @click="draft.roleFacts.splice(index, 1)">
        Убрать факт {{ index + 1 }}
      </button>
    </article>
    <h3>Что ещё нужно уточнить</h3>
    <div v-for="(_, index) in draft.unknowns" :key="index">
      <label :for="'unknown-' + index">Уточнение {{ index + 1 }}</label
      ><textarea
        :id="'unknown-' + index"
        v-model="draft.unknowns[index]"
        rows="2"
        :disabled="disabled"
      /><button :disabled="disabled" @click="draft.unknowns.splice(index, 1)">
        Убрать уточнение {{ index + 1 }}
      </button>
    </div>
    <button
      :disabled="disabled || draft.unknowns.length >= 40"
      @click="draft.unknowns.push('')"
    >
      Добавить уточнение
    </button>
    <article v-for="(topic, index) in draft.topics" :key="index">
      <h3>Тема {{ index + 1 }}</h3>
      <label :for="'topicTitle-' + index">Название темы {{ index + 1 }}</label
      ><input
        :id="'topicTitle-' + index"
        v-model="topic.title"
        :disabled="disabled"
      />
      <label :for="'topicExplanation-' + index"
        >Объяснение темы {{ index + 1 }}</label
      ><textarea
        :id="'topicExplanation-' + index"
        v-model="topic.explanation"
        rows="6"
        :disabled="disabled"
      />
      <label :for="'topicMechanism-' + index"
        >Механизм темы {{ index + 1 }}, по одному шагу на строку</label
      ><textarea
        :id="'topicMechanism-' + index"
        :value="topic.mechanism.join('\n')"
        rows="4"
        :disabled="disabled"
        @input="mechanism(index, $event)"
      />
      <label :for="'topicTradeoff-' + index"
        >Ограничения и компромиссы темы {{ index + 1 }}</label
      ><textarea
        :id="'topicTradeoff-' + index"
        v-model="topic.tradeoff"
        rows="4"
        :disabled="disabled"
      />
      <section v-for="(question, number) in topic.questions" :key="number">
        <h4>Вопрос {{ index + 1 }}.{{ number + 1 }}</h4>
        <label :for="`projectQuestion-${index}-${number}`"
          >Условие вопроса {{ index + 1 }}.{{ number + 1 }}</label
        ><textarea
          :id="`projectQuestion-${index}-${number}`"
          v-model="question.question"
          rows="3"
          :disabled="disabled"
        />
        <label :for="`projectAnswer-${index}-${number}`"
          >Ответ {{ index + 1 }}.{{ number + 1 }}</label
        ><textarea
          :id="`projectAnswer-${index}-${number}`"
          v-model="question.answer"
          rows="6"
          :disabled="disabled"
        />
        <label :for="`projectCriteria-${index}-${number}`"
          >Критерии ответа {{ index + 1 }}.{{ number + 1 }}</label
        ><textarea
          :id="`projectCriteria-${index}-${number}`"
          v-model="question.criteria"
          rows="3"
          :disabled="disabled"
        />
        <button
          :disabled="disabled || topic.questions.length === 1"
          @click="topic.questions.splice(number, 1)"
        >
          Убрать вопрос {{ index + 1 }}.{{ number + 1 }}
        </button>
      </section>
      <section
        v-for="(reference, number) in topic.codeReferences"
        :key="number"
      >
        <h4>Фрагмент кода {{ index + 1 }}.{{ number + 1 }}</h4>
        <label :for="`codeSource-${index}-${number}`"
          >Источник фрагмента {{ index + 1 }}.{{ number + 1 }}</label
        ><select
          :id="`codeSource-${index}-${number}`"
          v-model="reference.sourceId"
          :disabled="disabled"
        >
          <option
            v-for="material in materials"
            :key="material.id"
            :value="material.id"
          >
            {{ material.path }}
          </option>
        </select>
        <div class="generation-line-range">
          <label
            >Начальная строка<input
              v-model.number="reference.startLine"
              type="number"
              min="1"
              :disabled="disabled" /></label
          ><label
            >Конечная строка<input
              v-model.number="reference.endLine"
              type="number"
              min="1"
              :disabled="disabled"
          /></label>
        </div>
        <label :for="`codeExplanation-${index}-${number}`"
          >Пояснение фрагмента {{ index + 1 }}.{{ number + 1 }}</label
        ><textarea
          :id="`codeExplanation-${index}-${number}`"
          v-model="reference.explanation"
          rows="3"
          :disabled="disabled"
        />
        <button
          :disabled="disabled"
          @click="topic.codeReferences.splice(number, 1)"
        >
          Убрать ссылку {{ index + 1 }}.{{ number + 1 }}
        </button>
      </section>
      <button
        :disabled="disabled || draft.topics.length === 1"
        @click="draft.topics.splice(index, 1)"
      >
        Убрать тему {{ index + 1 }}
      </button>
    </article>
  </section>
</template>
