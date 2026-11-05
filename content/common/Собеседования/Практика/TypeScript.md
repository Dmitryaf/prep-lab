---
title: "TypeScript: практические задачи"
priority: P1
updated: 2026-10-28
---

# TypeScript: практические задачи

[[Собеседования/00. Карта раздела|Карта банка]]

Решайте до просмотра разбора. Исходные ошибки в коде сохранены намеренно. Если в условии не указаны среда выполнения и режим или поведение пустого входа, сначала сформулируйте нужное уточнение.

> [!abstract]- Вопросы и задачи на этой странице
>
> - [[Собеседования/Практика/TypeScript#Тип результата getValue|Тип результата getValue]]
> - [[Собеседования/Практика/TypeScript#Необязательные поля, кроме выбранных|Необязательные поля, кроме выбранных]]
> - [[Собеседования/Практика/TypeScript#Type guard для неизвестных данных|Type guard для неизвестных данных]]
> - [[Собеседования/Практика/TypeScript#Тип результата асинхронной функции, которую нельзя менять|Тип результата асинхронной функции, которую нельзя менять]]
> - [[Собеседования/Практика/TypeScript#Типизированная композиция where и sort|Типизированная композиция where и sort]]
> - [[Собеседования/Практика/TypeScript#Расширение входных свойств Vue-компонента|Расширение входных свойств Vue-компонента]]
> - [[Собеседования/Практика/TypeScript#Типизация меню в reduce|Типизация меню в reduce]]
> - [[Собеседования/Практика/TypeScript#Построить utility type по шагам|Построить utility type по шагам]]
> - [[Собеседования/Практика/TypeScript#Ключи по строковому шаблону|Ключи по строковому шаблону]]

## Тип результата getValue

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Связываю ключ с keyof T, возвращаю T[K] без any; для литерального ключа сохраняю конкретный тип поля, неверный ключ отвергается компилятором.
**Изучить:** [[Фронтенд/TypeScript/04. Обобщённые типы и ограничения|Generics и ограничения ключей]]

Типизируйте доступ по ключу так, чтобы ключ зависел от типа объекта, а результат — от выбранного поля. Вызов с отсутствующим ключом должен отклоняться компилятором.

Пример: для `{ count: 1, label: 'ok' }` вызов `getValue(object, 'count')` возвращает число с типом number, а `'label'` — строку с типом string. Ключ `'missing'` должен дать ошибку типов. База задачи — доступ к одному полю обычного объектного типа, без вложенных путей и runtime-валидации JSON.

```ts
function getValue(obj, property) {
  return obj[property];
}
```

> [!example]- Варианты типов
>
> ```ts
> // checked-example: typed-getter
> function getValue<T extends object, K extends keyof T>(obj: T, property: K): T[K] {
>   return obj[property];
> }
> // Альтернатива со своим, более узким ограничением на объект:
> const getValueRecord = <T extends Record<string, unknown>, P extends keyof T>(
>   obj: T, property: P
> ): T[P] => obj[property];
> ```
>

**Дополнительные проверки:** объект {a:1,b:2,x:'#'}, объект {a:true,b:false,c:true,d:[]} и массив []. Проверьте getValue(obj,'a'), отсутствующий ключ 'd' у первого объекта и getValue(array,1000). Объясните проверку объекта во время выполнения и разницу Record<string,unknown>/Record<string,any>. Array и интерфейс без индексной сигнатуры требуют отдельного внимания к ограничению T.

**Проверка противоречивого условия:** если ключ литеральный, результат не обязан быть объединением всех значений объекта. Для словаря отсутствующий ключ может быть допустим статически, но дать undefined во время выполнения; объясни влияние noUncheckedIndexedAccess. Не меняй тип ради ошибочного ожидания в тесте.

## Необязательные поля, кроме выбранных

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Делаю выбранные ключи обязательными, остальные optional; сохраняю типы значений и readonly, отвергаю неизвестный ключ. Проверяю изначально optional-поле и пустой набор ключей.
**Изучить:** [[Фронтенд/TypeScript/05. Вспомогательные типы и операторы типов|Partial, Pick, Omit и Required]]

Напиши `OptionalExcept<T, K>`, который делает все поля необязательными, кроме ключей K. Выбранные поля должны стать обязательными, даже если в T были optional. Неверный ключ должен отвергаться компилятором. readonly сохраняется. Условие относится к одному объектному типу; преобразование union вариантов здесь не требуется. Проверяй с `strict` и `exactOptionalPropertyTypes`.

Пример: из `{ id?: string; name: string; age: number }` и ключа `'id'` получаем объект с обязательным id и необязательными name/age. Сначала разложи контракт на две части, затем составь тип.

> [!example]- Разбор собственного utility type
>
> `Omit<T, K>` оставляет остальные поля, Partial делает их optional. Pick выбирает K, Required делает их обязательными. Пересечение соединяет эти непересекающиеся части. Один `Partial<T> & Pick<T, K>` не сделает изначально optional-поле обязательным.
>
> ```ts
> // checked-example: optional-except
> type OptionalExcept<T, K extends keyof T> =
>   Partial<Omit<T, K>> & Required<Pick<T, K>>;
>
> type User = {
>   id?: string;
>   readonly tenantId: string;
>   name: string;
>   age: number;
> };
> type UserDraft = OptionalExcept<User, 'id' | 'tenantId'>;
> const minimal: UserDraft = { id: 'u1', tenantId: 't1' };
> const withName: UserDraft = { id: 'u1', tenantId: 't1', name: 'Анна' };
> // @ts-expect-error: выбранный id обязателен, хотя в User он optional
> const missing: UserDraft = { tenantId: 't1' };
> // @ts-expect-error: тип значения поля сохраняется
> const wrong: UserDraft = { id: 'u1', tenantId: 't1', age: '20' };
> // @ts-expect-error: неизвестный ключ
> type Invalid = OptionalExcept<User, 'email'>;
> // @ts-expect-error: readonly выбранного поля сохраняется
> minimal.tenantId = 't2';
> const allOptional: OptionalExcept<User, never> = {};
> const allRequired: OptionalExcept<User, keyof User> = {
>   id: 'u1', tenantId: 't1', name: 'Анна', age: 20,
> };
> ```
>
> В проверке компилятор должен принять положительные примеры и найти ошибку в каждой строке с expect-error. Сам комментарий не доказывает правильность: если ошибка исчезла, tsc сообщает о неиспользованной директиве. С `exactOptionalPropertyTypes` отсутствие optional-поля отличается от его явного значения undefined; явный union с undefined — отдельный контракт. Тип не преобразует объект, не проверяет JSON и не запрещает изменение во время выполнения.
>
> **Усложнение.** Для объединения нескольких объектных типов сначала выбери: преобразовывать каждый вариант отдельно или только общие ключи. Не выдавай этот тип за автоматически корректное решение обоих случаев. Объясни, почему проверка данных во время выполнения остаётся нужна.

## Type guard для неизвестных данных

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Проверяю объект, дискриминант и конечный неотрицательный radius; отвергаю null, массив и неверный тип поля. Type predicate позволяет читать radius после проверки без as.
**Изучить:** [[Фронтенд/TypeScript/07. API, unknown и проверка данных|Сужение unknown на границе данных]]

Из JSON приходит неизвестное значение. Напиши `isCircle`, которое проверяет объект с `kind: 'circle'` и конечным неотрицательным числом radius. Массивы и null отвергаются; дополнительные поля разрешены. В этом упражнении вход — обычные JSON-данные, не Proxy и не объект с исполняемыми getters.

Примеры: `{ kind: 'circle', radius: 0 }` → true; `{ kind: 'circle', radius: '2' }` и null → false. После успешного `if (isCircle(value))` компилятор должен разрешать `value.radius` как number.

> [!example]- Разбор проверки и type predicate
>
> Проверяем объект до оператора in, затем отличительное поле и значение radius. Одного наличия radius недостаточно: `{ radius: 'large' }` нельзя обещать как Circle. Type predicate сообщает компилятору результат нашей проверки, но не доказывает полноту её реализации.
>
> ```ts
> // checked-example: circle-guard
> type Circle = { kind: 'circle'; radius: number };
> function isCircle(value: unknown): value is Circle {
>   return typeof value === 'object' && value !== null && !Array.isArray(value)
>     && 'kind' in value && value.kind === 'circle'
>     && 'radius' in value && typeof value.radius === 'number'
>     && Number.isFinite(value.radius) && value.radius >= 0;
> }
> function area(value: unknown): number | null {
>   return isCircle(value) ? Math.PI * value.radius ** 2 : null;
> }
> ```
>
> Проверки: корректный круг, нулевой радиус, null, массив, строковый радиус, отсутствие kind, отрицательный radius, NaN и Infinity. Последние два значения не приходят из корректного JSON, но могут появиться у других вызывающих функций. После успешной проверки доступ к radius должен компилироваться без as; вне проверки доступ к unknown должен отвергаться.

Механизмы: [[Фронтенд/TypeScript/05. Вспомогательные типы и операторы типов|utility types]] и [[Фронтенд/TypeScript/07. API, unknown и проверка данных|проверка неизвестных данных]].

## Тип результата асинхронной функции, которую нельзя менять

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Вывожу тип выполненного результата через typeof, ReturnType и Awaited, не копирую поля вручную; отличаю Promise от его значения и статический тип от проверки API во время выполнения.
**Изучить:** [[Фронтенд/TypeScript/05. Вспомогательные типы и операторы типов|ReturnType и Awaited]]

Измените только User так, чтобы проверка типов прошла. getUser и проверочные типы менять нельзя.

Ожидаемый тип User — `{ name: string; age: number }`, а не Promise этого объекта. Значение `{ name: 'Анна', age: 30 }` должно подходить, строковый age — нет. Саму функцию для получения типа вызывать не нужно.

```ts
// допустим есть функцияполучения данных с бэкенда. Её код сгенерирован, трогать нельзя!
const getUser = async (): Promise<{ name: string; age: number; }> =>
({ name: 'john', age: 30 })

// как получить из этой функции тип возвращаемого бэкендом значения?

type User = 'todo: тут надо изменить тип! возможно использовать generics';

/**

- код ниже трогать нельзя, он чисто для тестов. когда справишься с заданием - ошибка на строчке ниже пропадет
  */
  type test = Expect<Equal<User, { name: string; age: number; }>>

type Expect<T extends true> = T;
type Equal<X, Y> =
(<T>() => T extends X ? 1 : 2) extends
<T>() => T extends Y ? 1 : 2
? true
: false;
```

> [!example]- Разбор типа результата
>
> `typeof getUser` получает тип функции. `ReturnType` берёт её результат `Promise<...>`. `Awaited` получает значение после ожидания.
>
> ```ts
> // checked-example: async-result
> const getUser = async (): Promise<{ name: string; age: number }> =>
>   ({ name: 'john', age: 30 });
> type User = Awaited<ReturnType<typeof getUser>>;
> ```
>
> Это вычисление типа, а не запуск запроса. Если сервер вернёт другое тело, TypeScript не проверит его автоматически: на границе API нужна проверка данных.

## Типизированная композиция where и sort

JavaScript-вариант находится в раскрываемом разборе ниже.

Реализуйте query, where и sort с показанным контрактом. Уточните направление sort и обработку нескольких полей. Дополнительно: проверки для сужения типа, сложность, память и копирование.

```ts
type Person = { id: number; name: string; surname: string; age: number };

const data: Person[] = [
{ id: 1, name: 'John', surname: 'Doe', age: 34 },
{ id: 2, name: 'John', surname: 'Doe', age: 33 },
{ id: 3, name: 'John', surname: 'Doe', age: 35 },
{ id: 4, name: 'Mike', surname: 'Doe', age: 35 },
];

const ids = query(
where<Person>({ name: 'John' }),
where<Person>({ surname: 'Doe' }),
sort<Person>('age'),
)(data).map((u) => u.id);

console.log(ids);
```

**Базовый контракт для сравнения с разбором:** операции выполняются слева направо; where сравнивает указанные собственные строковые поля через Object.is; sort сортирует по возрастанию одного обязательного строкового или конечного числового поля. Смешанные типы поля запрещены этим вариантом. Исходный массив не меняется; объекты элементов не клонируются. Несколько полей и type-guard фильтр — дополнительные варианты после базового решения.

> [!example]- Разбор — базовое решение
>
> Для TypeScript-входа в условии результат — **[2, 1, 3]**: три John/Doe имеют возраст 33, 34, 35. Ниже отдельное типизированное решение именно этого условия. Исторический JavaScript-вариант с другими возрастами сохранён дальше и даёт другой результат.
>
> ```ts
> // core-example: typed-query
> type Operation<T> = (items: readonly T[]) => T[];
> type SortKey<T> = { [K in keyof T]-?: T[K] extends string | number ? K : never }[keyof T];
>
> function where<T>(condition: Partial<T>): Operation<T> {
>   const keys = Object.keys(condition) as (keyof T)[];
>   return items => items.filter(item =>
>     keys.every(key => Object.is(item[key], condition[key])));
> }
> function sort<T>(key: SortKey<T>): Operation<T> {
>   return items => [...items].sort((a, b) => {
>     const x = a[key], y = b[key];
>     if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) return x - y;
>     if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y);
>     throw new TypeError('Поле должно содержать строки или конечные числа одного типа');
>   });
> }
> function query<T>(...operations: Operation<T>[]): Operation<T> {
>   return items => operations.reduce((result, operation) => operation(result), [...items]);
> }
> ```
>
> Каждая операция принимает массив T и возвращает массив того же T, поэтому результат композиции остаётся Person[]. Ограничение SortKey запрещает сортировку по boolean или отсутствующему полю. Оно не валидирует сетевой JSON: типы входа предполагаются уже проверенными. Сравнение where поверхностное; два одинаково выглядящих объекта не равны через Object.is. Символьные ключи в этом учебном варианте не поддерживаются.
>
> Проверьте текущий пример, `query<Person>()(data)` как отдельную копию, пустой список, отсутствие совпадений, одинаковые возраста и сохранение исходного порядка. В TypeScript ошибки `sort<Person>('missing')` и `where<Person>({age: '33'})` должны отклоняться. Для ожидаемых обычных сортировок обсуждают O(n log n), но стандарт JavaScript не закрепляет алгоритм и его точную сложность для всех движков. Фильтр с k полями требует O(nk); новые массивы требуют дополнительной памяти O(n).
>
> Для сужения типа нужен отдельный overload фильтра с предикатом `value is S`; Partial<T> сам по себе такой гарантии не даёт. Для нескольких полей сравнивают второе только при нуле первого, согласовав направление и правила равенства.

> [!example]- Исходный JavaScript-разбор и ограничения
>
> **JavaScript-вариант с другим входом.**
>
> ```js
> const data = [
>   { id: 1, name: 'John', surname: 'Doe', age: 20 },
>   { id: 2, name: 'John', surname: 'Doe', age: 21 },
>   { id: 3, name: 'John', surname: 'Toe', age: 22 },
>   { id: 4, name: 'John', surname: 'Toe', age: 22 },
> ];
>
> const ids = query(
>   where({ name: 'John' }),
>   where({ surname: 'Doe' }),
>   sort('age'),
> )(data).map((u) => u.id);
>
> console.log(ids);
>
> function where(condition) {}
>
> function sort(field) {}
>
> function query(...operations) {}
> ```
>
> **Базовое решение**
>
> ```js
> function where(condition) {
>   return (items) =>
>     items.filter((item) =>
>       Object.entries(condition).every(([field, expectedValue]) =>
>         Object.is(item[field], expectedValue),
>       ),
>     );
> }
>
> function compareValues(a, b) {
>   if (typeof a === 'number' && typeof b === 'number') {
>     return a - b;
>   }
>
>   if (typeof a === 'string' && typeof b === 'string') {
>     return a.localeCompare(b);
>   }
>
>   return String(a).localeCompare(String(b));
> }
>
> function sort(field) {
>   return (items) =>
>     [...items].sort((a, b) => compareValues(a[field], b[field]));
> }
>
> function query(...operations) {
>   return (items) =>
>     operations.reduce((result, operation) => operation(result), items);
> }
> ```
>
> **Что выведется**
>
> ```js
> [1, 2]
> ```
>
> **Почему так**
>
> - `where({ name: 'John' })` оставляет все элементы с `name === 'John'`;
> - `where({ surname: 'Doe' })` оставляет первые два элемента;
> - `sort('age')` сортирует их по возрасту;
> - `map((u) => u.id)` возвращает `[1, 2]`.
>
> **Вопрос: как сравнивать значения в sort и почему?**
>
> Не стоит бездумно делать `a[field] > b[field]`, если возможны разные типы данных.
>
> Практичный ответ:
>
> - числа сравнивать численно;
> - строки сравнивать через `localeCompare` или простое лексикографическое сравнение, если locale не важна;
> - `null` / `undefined` обработать отдельно;
> - смешанные типы лучше либо запретить, либо явно нормализовать;
> - не полагаться на неявное приведение типов без причины.
>
> **Вопрос: приведение типов и type guards**
>
> Можно сказать:
>
> - сначала проверяю тип значения;
> - для чисел использую numeric compare;
> - для строк - string compare;
> - для неизвестных типов либо кидаю ошибку, либо привожу к строке как запасной вариант;
> - в TypeScript можно описать допустимые поля и значения через generic constraints.
>
> **Вопрос: `Object.prototype.toString.call`**
>
> `Object.prototype.toString.call(value)` можно использовать как более точную проверку встроенного типа:
>
> ```js
> Object.prototype.toString.call([]); // '[object Array]'
> Object.prototype.toString.call(null); // '[object Null]'
> Object.prototype.toString.call(new Date()); // '[object Date]'
> ```
>
> Но для этой задачи обычно достаточно `typeof`, `Array.isArray`, проверки `value === null` и явной обработки ожидаемых типов.
>
> **Сложность алгоритма**
>
> Пусть:
>
> - `n` - количество элементов;
> - `k` - количество полей в condition;
> - `m` - количество операций.
>
> Один `where` работает примерно за `O(n * k)`.
>
> `sort` работает за `O(n log n)`.
>
> В конкретной задаче две фильтрации и одна сортировка:
>
> ```text
> O(n * k1) + O(n * k2) + O(n log n)
> ```
>
> Доминирует сортировка:
>
> ```text
> O(n log n)
> ```
>
> По памяти:
>
> - `filter` создает новые массивы;
> - `sort` в решении делает копию через `[...items]`;
> - значит память примерно `O(n)`.
>
> **Частые ошибки**
>
> - мутировать исходный массив через `items.sort(...)`;
> - сравнивать строки и числа одним способом;
> - использовать `==` вместо явного сравнения;
> - забыть, что `sort` должен вернуть функцию-операцию;
> - сделать `query` некомпонуемым;
> - не объяснить сложность.

**Критерии ответа:** Получаю [2, 1, 3] для текущего входа, сохраняю тип Person и исходный массив; проверяю пустой список и недопустимое поле.

**Изучить:** [[Фронтенд/TypeScript/04. Обобщённые типы и ограничения|Объяснение и примеры]]

## Расширение входных свойств Vue-компонента

Проверьте контракт ссылки в стеке Vue и TypeScript. Есть ли конфликт при расширении типов? Отдельно обсудите передачу содержимого через свойство или обычный слот.

```ts
import type { VNodeChild } from 'vue';
import type { RouterLinkProps } from 'vue-router';

interface AppLinkProps extends RouterLinkProps {
  class?: string;
  theme?: 'light' | 'dark';
  content?: VNodeChild;
}
```

Само повторение совместимого свойства не является ошибкой. Проверяйте фактические определения типов в установленной версии. content в этом примере — специально заданное свойство; оно не обозначает автоматически стандартный слот Vue.

## Типизация меню в reduce

Типизируйте меню: строковому ключу соответствует массив строк. `items` — входной массив путей. Сравните индексную сигнатуру и `Record<string, string[]>`. Меняет ли имя параметра сигнатуры её смысл? Затем проверьте сортировку и наличие группы перед `push`.

```ts

let menu = {}

interface Menu {
  [index: string]: string[]
}

if (items) {
    menu = items.sort().reduce((acc, pathname: string) => {
        const [item,article]=pathname.split('/')
        if (!article) {
            acc[item] = []
        } else {
            acc[item].push(article)
        }
        return acc
    }, {})
}
```

Для исправления выбираем контракт: массив строк `group` либо `group/article`, ровно один непустой сегмент или два. Порядок статей сохраняется по входу, повторы разрешены. Отдельная запись `group` создаёт пустую группу, но не стирает уже собранные статьи. Входной массив не меняется; строки с пустым сегментом либо третьим сегментом отклоняются.

**Критерии ответа:** Типизирую аккумулятор без any, создаю группу до push, не стираю статьи отдельной строкой группы и не сортирую исходный массив; проверяю ключ __proto__.
**Изучить:** [[Фронтенд/TypeScript/05. Вспомогательные типы и операторы типов|Record и индексированные типы]]

> [!example]- Разбор типизированного меню
>
> `Record<string, string[]>` и индексная сигнатура описывают одинаковую связь ключа и значения; имя параметра `index` смысла не меняет. Но тип не создаёт массив для нового ключа. В исходнике sort мутирует вход, отдельная строка группы может сбросить уже собранное, а push вызывается до гарантированного создания массива.
>
> ```ts
> // checked-example: typed-menu
> function buildMenu(items: readonly string[]): Record<string, string[]> {
>   return items.reduce<Record<string, string[]>>((menu, pathname) => {
>     const parts = pathname.split('/');
>     if (parts.length > 2 || parts.some((part) => part.length === 0)) {
>       throw new TypeError('Invalid menu path');
>     }
>     const group = parts[0];
>     if (group === undefined) throw new TypeError('Invalid menu path');
>     const articles = menu[group] ?? (menu[group] = []);
>     const article = parts[1];
>     if (article !== undefined) articles.push(article);
>     return menu;
>   }, Object.create(null) as Record<string, string[]>);
> }
> ```
>
> Объект без прототипа позволяет использовать ключ `__proto__` как обычную группу. Утверждение типа здесь описывает только что созданный пустой словарь, не скрывает проверку ответа API. `noUncheckedIndexedAccess` заставляет учитывать отсутствие результата чтения по ключу; указанный тип сам по себе не гарантирует наличие любой группы.
>
> `['guide/b', 'guide', 'guide/a', 'other']` даёт `{ guide: ['b', 'a'], other: [] }`; `[]` — пустой словарь; `'a/b/c'` и `'a/'` дают ошибку. Отдельно проверь неизменность входа и ключи `'constructor'`/`'__proto__'`. При общем числе символов L время O(L), память O(L) для результата. Если нужен порядок самих групп, лучше явно вернуть Map: у обычного объекта ключи, похожие на целые индексы, имеют особый порядок.
>
> Типовые операции: [TypeScript: Indexed Access Types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html).

**Уточнения**
- Как сохранить порядок групп, если имена могут быть строками '2' и '10'?
- Где проверять неизвестные данные API, прежде чем передавать их в эту функцию?

## Построить utility type по шагам

Напиши `MyPick<T, K>` и `MyPartial<T>`. Затем `If<C, Yes, No>`: для true вернуть Yes, для false — No. Попробуй объяснить каждый элемент записи обычными словами.

> [!example]- Разбор mapped и conditional types
>
> ```ts
> // checked-example: utility-basics
> type MyPick<T, K extends keyof T> = { [P in K]: T[P] };
> type MyPartial<T> = { [P in keyof T]?: T[P] };
> type If<C extends boolean, Yes, No> = C extends true ? Yes : No;
> type PromiseValue<T> = T extends Promise<infer V> ? V : T;
>
> type PersonForTypes = { id: string; age: number };
> const preview: MyPick<PersonForTypes, 'id'> = { id: 'u1' };
> const patch: MyPartial<PersonForTypes> = { age: 30 };
> const selected: If<true, string, number> = 'yes';
> const resolved: PromiseValue<Promise<number>> = 42;
> // @ts-expect-error: ключа missing нет
> type BadPick = MyPick<PersonForTypes, 'missing'>;
> // @ts-expect-error: условие true выбрало string
> const wrongSelected: If<true, string, number> = 42;
> ```
>
> `keyof T` — допустимые ключи; `[P in K]` — перебор выбранных ключей; `T[P]` — тип значения под ключом; `?` делает поле необязательным. `extends` в условном типе проверяет совместимость. `infer V` просит компилятор вывести тип внутри Promise.
>
> В работе используй встроенные Pick, Partial и Awaited. Своя короткая версия нужна, чтобы понимать механизм. `PromiseValue` снимает один уровень обычного Promise; встроенный Awaited обрабатывает более общий случай.

## Ключи по строковому шаблону

Разреши ключи вида `user_...`, но запрети `order_...`. Отдельно объясни, почему строковый шаблон не проверяет произвольный текст из input.

> [!example]- Разбор template literal types
>
> ```ts
> // checked-example: template-keys
> type UserKey = `user_${string}`;
> const validKey: UserKey = 'user_42';
> // @ts-expect-error: другой префикс
> const invalidKey: UserKey = 'order_42';
>
> type NonEmpty<S extends string> = S extends '' ? never : S;
> const literal: NonEmpty<'name'> = 'name';
> // @ts-expect-error: пустой литерал исключён
> const emptyLiteral: NonEmpty<''> = '';
> ```
>
> Шаблон собирает тип строки из частей. Здесь `user_` тоже допустим: `${string}` включает пустую строку. А `NonEmpty<string>` остаётся `string` и не доказывает, что значение из input непустое. Его проверяют во время выполнения, например через `value.trim().length > 0`, если пробелы тоже запрещены.
>
> Это полезное уточнение Senior-интервью. Рекурсивный разбор сложных строк типами изучай только под конкретную задачу.
