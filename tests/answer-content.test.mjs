import test from 'node:test';
import assert from 'node:assert/strict';
import {answerContent} from '../src/shared/answer-content.js';

test('a repeated short answer leaves only the unique continuation', () => {
  const question = {shortAnswer:'Основной ответ.', answer:'Основной ответ.\n\nУникальный пример.'};
  const before = structuredClone(question);
  assert.deepEqual(answerContent(question), {main:'Основной ответ.', additional:'Уникальный пример.', details:''});
  assert.deepEqual(question, before);
});

test('line endings and outside whitespace do not create empty supplements', () => {
  assert.deepEqual(answerContent({shortAnswer:'  Первая.\n\nВторая. ', answer:'\r\nПервая.\r\n\r\nВторая.\r\n'}),
    {main:'Первая.\n\nВторая.', additional:'', details:''});
});

test('a different answer is preserved, including a matching phrase inside code', () => {
  const answer = 'Другая мысль.\n\n```text\nОсновной ответ.\n```';
  assert.equal(answerContent({shortAnswer:'Основной ответ.', answer}).additional, answer);
  assert.equal(answerContent({shortAnswer:'Ответ', answer:'Ответственность другая.'}).additional, 'Ответственность другая.');
});

test('a prefix without a paragraph boundary is not silently removed', () => {
  assert.equal(answerContent({shortAnswer:'Первая строка.', answer:'Первая строка.\nПродолжение абзаца.'}).additional,
    'Первая строка.\nПродолжение абзаца.');
});

test('known followups are removed without losing the example after them', () => {
  assert.deepEqual(answerContent({shortAnswer:'Ответ.', answer:'Ответ.\n\n**Уточнения**\n\n- Почему?\n- Когда?\n\n```js\nconsole.log(1);\n```', followups:['Почему?','Когда?','Дочерний вопрос?']}),
    {main:'Ответ.', additional:'```js\nconsole.log(1);\n```', details:''});
});

test('unrecognised or ambiguous followup lists remain readable', () => {
  for (const list of ['**Уточнения**\n- Другой вопрос?', '**Уточнения**\n- Почему?\n  Важное пояснение.']) {
    assert.equal(answerContent({shortAnswer:'Ответ.', answer:'Ответ.\n\n'+list, followups:['Почему?']}).additional, list);
  }
});

test('followup headings inside backtick and tilde fences remain verbatim', () => {
  for (const fence of ['```', '~~~~']) {
    const additional = `${fence}text\n**Уточнения**\n- Почему?\n${fence}`;
    assert.equal(answerContent({shortAnswer:'Ответ.', answer:'Ответ.\n\n'+additional, followups:['Почему?']}).additional, additional);
  }
});

test('answers without shortAnswer retain project details and remove known followup metadata', () => {
  assert.deepEqual(answerContent({answer:'Решение.\n\n**Уточнения**\n- Почему?', details:'Проектный пример.', followups:['Почему?']}),
    {main:'Решение.', additional:'', details:'Проектный пример.'});
});

test('identical details are not shown a second time', () => {
  assert.equal(answerContent({answer:'Решение.', details:' Решение.\r\n'}).details, '');
  assert.equal(answerContent({shortAnswer:'Ответ.', answer:'Ответ.\n\nПример.', details:'Пример.'}).details, '');
});

test('missing answers and whitespace-only short answers have no empty sections', () => {
  assert.deepEqual(answerContent({answer:''}), {main:'', additional:'', details:''});
  assert.deepEqual(answerContent({shortAnswer:' \n ', answer:'Полный ответ.'}), {main:'Полный ответ.', additional:'', details:''});
});
