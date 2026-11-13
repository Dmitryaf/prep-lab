---
title: "JavaScript: практические задачи"
priority: P1
updated: 2026-10-29
---

# JavaScript: практические задачи

[[Собеседования/00. Карта раздела|Карта банка]]

Решайте до просмотра разбора. Исходные ошибки в коде сохранены намеренно. Если в условии не указаны среда выполнения и режим или поведение пустого входа, сначала сформулируйте нужное уточнение.

> [!abstract]- Вопросы и задачи на этой странице
>
> - [[Собеседования/Практика/JavaScript#Область видимости, ссылки и контекст|Область видимости, ссылки и контекст]]
> - [[Собеседования/Практика/JavaScript#var в цикле и отложенные вызовы|var в цикле и отложенные вызовы]]
> - [[Собеседования/Практика/JavaScript#userService: фильтрация и потеря this|userService: фильтрация и потеря this]]
> - [[Собеседования/Практика/JavaScript#Стрелка и this после извлечения метода|Стрелка и this после извлечения метода]]
> - [[Собеседования/Практика/JavaScript#TDZ и затенение age|TDZ и затенение age]]
> - [[Собеседования/Практика/JavaScript#Мутация объекта и замена параметра|Мутация объекта и замена параметра]]
> - [[Собеседования/Практика/JavaScript#Замыкание: локальный счётчик и ссылка на объект|Замыкание: локальный счётчик и ссылка на объект]]
> - [[Собеседования/Практика/JavaScript#Promise, очереди и таймеры|Promise, очереди и таймеры]]
> - [[Собеседования/Практика/JavaScript#promisify: ошибка в первом аргументе|promisify: ошибка в первом аргументе]]
> - [[Собеседования/Практика/JavaScript#Микрозадачи, таймеры и голодание отрисовки|Микрозадачи, таймеры и голодание отрисовки]]
> - [[Собеседования/Практика/JavaScript#Реализовать Promise.all|Реализовать Promise.all]]
> - [[Собеседования/Практика/JavaScript#Реализовать Promise.any|Реализовать Promise.any]]
> - [[Собеседования/Практика/JavaScript#Последовательная очередь записи файла|Последовательная очередь записи файла]]
> - [[Собеседования/Практика/JavaScript#Последовательные POST: передача данных и ошибки|Последовательные POST: передача данных и ошибки]]
> - [[Собеседования/Практика/JavaScript#Повторное выбрасывание ошибки в цепочке Promise|Повторное выбрасывание ошибки в цепочке Promise]]
> - [[Собеседования/Практика/JavaScript#Микрозадачи между обработчиками таймеров|Микрозадачи между обработчиками таймеров]]
> - [[Собеседования/Практика/JavaScript#Синхронный код и продолжение после await|Синхронный код и продолжение после await]]
> - [[Собеседования/Практика/JavaScript#Коллекции и преобразование данных|Коллекции и преобразование данных]]
> - [[Собеседования/Практика/JavaScript#Глубокое копирование: контракт и проверочные примеры|Глубокое копирование: контракт и проверочные примеры]]
> - [[Собеседования/Практика/JavaScript#Значения, встречающиеся ровно один раз|Значения, встречающиеся ровно один раз]]
> - [[Собеседования/Практика/JavaScript#Преобразование входного массива|Преобразование входного массива]]
> - [[Собеседования/Практика/JavaScript#Функции, объекты и интерфейсы|Функции, объекты и интерфейсы]]
> - [[Собеседования/Практика/JavaScript#Мемоизация функции с очисткой кэша|Мемоизация функции с очисткой кэша]]
> - [[Собеседования/Практика/JavaScript#Освобождаемые события (Disposable)|Освобождаемые события (Disposable)]]
> - [[Собеседования/Практика/JavaScript#fetchRetry с задержкой|fetchRetry с задержкой]]
> - [[Собеседования/Практика/JavaScript#EventEmitter: on/off/emit и цепочка вызовов|EventEmitter: on/off/emit и цепочка вызовов]]
> - [[Собеседования/Практика/JavaScript#Управление запросами|Управление запросами]]
> - [[Собеседования/Практика/JavaScript#Ограничение конкурентности|Ограничение конкурентности]]
> - [[Собеседования/Практика/JavaScript#Deduplication запросов|Deduplication запросов]]
> - [[Собеседования/Практика/JavaScript#Cache с TTL|Cache с TTL]]
> - [[Собеседования/Практика/JavaScript#Очередь отправки|Очередь отправки]]
> - [[Собеседования/Практика/JavaScript#Debounce|Debounce]]
> - [[Собеседования/Практика/JavaScript#Throttle|Throttle]]
> - [[Собеседования/Практика/JavaScript#Цепочки функций и управляемый Promise|Цепочки функций и управляемый Promise]]
> - [[Собеседования/Практика/JavaScript#Сумма до пустого вызова|Сумма до пустого вызова]]
> - [[Собеседования/Практика/JavaScript#Pipe: результат одной функции передать следующей|Pipe: результат одной функции передать следующей]]
> - [[Собеседования/Практика/JavaScript#Promise с доступными resolve и reject|Promise с доступными resolve и reject]]
> - [[Собеседования/Практика/JavaScript#Реализовать Promise.allSettled|Реализовать Promise.allSettled]]
>

## Область видимости, ссылки и контекст

### var в цикле и отложенные вызовы

Что будет выведено в консоль?
```
for (var i = 0; i < 10; i++) {
    setTimeout(function() {

  console.log(i);
    }, 1000);}
```

Усложнение: назвать все возможные методы исправить поведение (замыкание, область видимости переменной, передача аргумента через setTimeout, каррирование через bind)

> [!example]- Разбор простыми словами
>
> В консоли десять раз появится 10: обработчики таймеров читают одну общую i, когда цикл уже завершился. Самое простое исправление — заменить var на let: у каждой итерации своя переменная, вывод от 0 до 9. Ещё можно передать текущее i аргументом setTimeout или создать отдельное замыкание. Изучить: [[Фронтенд/JavaScript/02. Области видимости и замыкания/03. Замыкания|замыкания]].

### userService: фильтрация и потеря this

1. Что выведет код? Что ожидалось? Как исправить? Предложите несколько вариантов.
2. Исправить программу так, чтобы она падала при выполнении данного кода.
```
const userService = {
    currentFilter: 'active',
    users: [
        {name: 'Alex', status: 'active'},
        {name: 'Nick', status: 'deleted'},
    ],
    getFilteredUsers: function() {
        return this.users.filter(function (user) {
            return user.status === this.currentFilter;
        });
    }}; console.log(userService.getFilteredUsers());
```

> [!example]- Разбор простыми словами
>
> Внешний метод вызван правильно, но обычная функция внутри filter не получает userService как this. В строгом режиме чтение this.currentFilter выбросит TypeError; в обычном script без strict this будет глобальным объектом, и при отсутствии там currentFilter получится пустой массив.
>
> Исправление: `this.users.filter(user => user.status === this.currentFilter)`. Стрелка берёт this внешнего метода. Чтобы исходный вариант гарантированно упал, выполняй его в strict mode или ES-модуле.

### Стрелка и this после извлечения метода

Определите вывод до запуска. Как изменится поведение при замене стрелки обычным методом?

```js
function Pet(name) {
    this._name = name;
    this.getName = () => this._name;
}

const cat = new Pet('Tom');
console.log(cat.getName())

const { getName } = cat;
console.log(getName())
```

> [!example]- Разбор простыми словами
>
> Оба раза Tom: стрелка сохранила this вызова конструктора. Обычный метод при вызове cat.getName() получил бы cat, но извлечённая функция getName() потеряла бы получателя. В strict mode обращение к this._name тогда завершится TypeError.

### TDZ и затенение age

Что выведется? Завершится ли функция?

```js
let age = 18;function logAge() {
// temporal dead zone start
console.log(age);

let age = 21; // temporal dead zone END

console.log(age);
}

logAge();
```

> [!example]- Разбор простыми словами
>
> Первое чтение age выбросит ReferenceError. Внутренний let скрывает внешний age во всей функции, но ещё не инициализирован. До второго console.log выполнение не дойдёт. Изучить: [[Фронтенд/JavaScript/02. Области видимости и замыкания/02. var, let, const, hoisting и TDZ|TDZ]].

### Мутация объекта и замена параметра

Что выведет исходный код? Сначала разберите каждый вызов, учитывая предыдущие изменения.

```js
let x = { a: 1, b: 2 };
function fn1(x) {
  x.a = 5;
}
function fn2() {
  x.a = 5;
}
function fn3(x) {
  x = 5;
}
function fn4() {
  x = 5;
}
fn1(x); console.log(x);
fn2(x); console.log(x);
fn3(x); console.log(x);
fn4(x); console.log(x);
```

> [!example]- Разбор — базовое решение
>
> Последовательность значений: `{a: 5, b: 2}`, `{a: 5, b: 2}`, `{a: 5, b: 2}`, затем `5`.
>
> В fn1 параметр содержит ссылку на тот же объект, что и внешняя x; запись x.a меняет общий объект. fn2 не имеет параметра x и находит внешнюю переменную по области видимости. fn3 получает собственную локальную переменную-параметр: присваивание числа меняет только её, а внешний x остаётся прежним. fn4 не имеет локального x, поэтому присваивает число внешней переменной.
>
> JavaScript передаёт аргументы по значению; для объекта этим значением является ссылка. Передача объекта не позволяет функции переприсвоить переменную вызывающего кода через параметр.
>
> Проверка переноса: замените fn3 этой функцией:
>
> ```js
> function fn3(value) {
>   return { ...value, a: 9 };
> }
> ```
>
> Внешний объект не изменится без присваивания возвращённого результата. В некоторых DevTools раскрытый объект показывается по актуальному состоянию; для фиксации снимка используйте JSON.stringify в момент вывода.

**Критерии ответа:** Предсказываю четыре вывода и различаю мутацию общего объекта, замену параметра и запись во внешнюю переменную.

**Изучить:** [[Фронтенд/JavaScript/08. Копирование объектов и иммутабельность/01. Ссылки и поверхностное копирование|Объяснение и примеры]]

### Замыкание: локальный счётчик и ссылка на объект

Определите count/value в каждом пункте. Для объекта объясните значение **в момент вызова**, учитывая, что интерактивная консоль может показывать объект при позднем раскрытии.

```js
let count = 0;
let value = { message: 'app initialized', isLogged: false };
function makeScopedLogger(count, value) {
  function logMessage() { console.log(count, value); /* 2 */ }
  count += 1;
  console.log(count, value); // 1
  value.isLogged = true;
  return logMessage;
}
const logMessage = makeScopedLogger(count, value);
value = { message: 'app run' };
logMessage();
console.log(count, value); // 3
```

> [!example]- Разбор простыми словами
>
> В точке 1: count = 1, исходный объект ещё с isLogged=false. В точке 2: локальный count по-прежнему 1, исходный объект уже с isLogged=true. В точке 3: внешний count = 0, новый объект `{ message: 'app run' }`.
>
> Примитивный параметр count независим от внешней переменной. Параметр value сначала указывает на тот же объект; переназначение внешнего value не меняет сохранённую ссылку внутри замыкания.

## Promise, очереди и таймеры

### promisify: ошибка в первом аргументе

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Возвращаю Promise, передаю аргументы и this, различаю успешный callback и ошибку; синхронный throw становится rejection.
**Изучить:** [[Фронтенд/JavaScript/05. Асинхронность/02. Promise — базовая модель и цепочки|Promise и обработка ошибок]]

Напишите адаптер функции с обратным вызовом, принимающим ошибку первым аргументом в Promise. Исходная функция принимает произвольное число аргументов; последний — callback(error,result). Успешный результат разрешает Promise, ошибка отклоняет его. Согласуйте this и синхронный throw.

Для базового решения сохраняй this вызывающей стороны; `null` или `undefined` первым аргументом callback означают успех, другое значение — ошибку. Например, адаптер функции `(a, b, done) => done(null, a + b)` после вызова с `(2, 3)` возвращает Promise со значением `5`. Несколько успешных значений callback и автоматическое получение типов не требуются.

```ts
function loadScript(src: string, callback: (error: Error | null, result?: unknown) => void) {
  /* исходная функция; реализация не предоставлена */
}
const promisify = (...args: any[]) => { /* Ваш код */ };
const loadScriptPromise = promisify(loadScript);
loadScriptPromise('url').then(result => { /* ... */ }).catch(error => { /* ... */ });
```

Тип параметра обратного вызова из экспорта заменён на unknown для читаемой сигнатуры; это JS-задача про адаптер, не требование вывести обобщённый тип.

> [!example]- Разбор простыми словами
>
> Возвращаем функцию, создающую Promise. Передаём исходные аргументы и завершающий callback:
>
> ```js
> // checked-example: promisify
> function promisify(fn) {
>   return function (...args) {
>     return new Promise((resolve, reject) => {
>       fn.call(this, ...args, (error, result) => {
>         if (error != null) reject(error);
>         else resolve(result);
>       });
>     });
>   };
> }
> ```
>
> This передаётся от вызова новой функции. Синхронный throw внутри executor автоматически отклоняет Promise. Контракт здесь даёт одно успешное значение; несколько значений callback требуют другого результата, например массива.

### Микрозадачи, таймеры и голодание отрисовки

1. В каком порядке выведутся сообщения и почему?
```
console.log(1)
  setTimeout(function() {
  console.log(2)})
  Promise.resolve(3).then(console.log)
  console.log(4)
  setTimeout(function() {
  console.log(5)}, 0)
  console.log(6)
  // Запишите, в каком порядке значения выведутся в консоль:
//
```

2. Что выведется если добавить в конец. Залогируются ли 2 и 5 и что будет с интерфейсом, будет ли реагировать на инпут.
```
const foo1 = () => {
  console.log('foo1')
     return Promise.resolve().then(foo1)}
   foo1(); // вызов foo1, объявленной выше
```

3. Что если заменить зацикливание промисов на таймауты
```
const foo2 = () => {
  console.log('foo2')
     setTimeout(foo2);}
  foo2(); // вызов foo2, объявленной выше
```

> [!example]- Разбор простыми словами
>
> Первый вариант: 1, 4, 6, 3, 2, 5. Синхронный код выполняется первым, затем Promise callback, затем таймеры.
>
> Во втором варианте foo1 постоянно добавляет микрозадачи: очередь не опустошается, таймеры 2 и 5 не получают очередь, интерфейс зависает. Замена на setTimeout отдаёт управление между задачами и позволяет обрабатывать другие события и кадры; точная частота не гарантирована. Изучить: [[Фронтенд/JavaScript/05. Асинхронность/01. Event Loop в браузере|Event Loop]].

### Реализовать Promise.all

**Формат раунда:** coding
**Этап кода:** main
**Критерии ответа:** Подписываюсь на все входы, сохраняю исходный порядок, обрабатываю пустой массив и обычные значения; первый отказ отклоняет результат, остальные операции не отменяются.
**Изучить:** [[Фронтенд/JavaScript/05. Асинхронность/03. Promise — статические методы|Агрегация Promise]]

Необходимо написать свою функцию promiseAll, которая является аналогом Promise.all.
• на вход поступает массив значений и Promise; пустой массив даёт Promise со значением []
• отказ, если хотя бы один промис упал
• успешное завершение, если все промисы успешно выполнены
• в случае успешного завершения порядок результатов должен сохраняться
• в случае отказа сразу отказ не дожидаясь остальных промис

```
const promiseAll = (promises) => {
  return new Promise((resolve, reject) => {
    // your code
  })}
const resolve = (value, timeout) =>
  new Promise((res) => setTimeout(res, timeout, value))
const reject = (value, timeout) =>
  new Promise((_, rej) => setTimeout(rej, timeout, value));
promiseAll([resolve(1, 200), resolve(2, 300), resolve(3, 100)])
  .then(console.log) // [1, 2, 3]
promiseAll([reject(1, 100), reject(2, 500), resolve(3, 1000)])
  .catch(console.error) // 1
```

**Дополнительный проверочный пример:**

```js
const wait = (time) =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve(time);
    }, time)
  );

const arr = [wait(3000), wait(1000), wait(2000)];

const a = new Date();

Promise.all(arr).then((data) => {
  console.log(data);

  const diff = (new Date().getTime() - a.getTime()) / 1000;
  console.log(diff);
});

// --------

function promiseAll() {}
```

Объясните порядок данных и приблизительное время выполнения, затем замените Promise.all на promiseAll. Добавьте пустой вход и отклонение.

> [!example]- Разбор Promise.all
>
> Идея: подписаться на каждый вход, записывать результат по его исходному индексу и считать завершения. Порядок завершения не должен менять порядок массива.
>
> По условию функция принимает массив значений и Promise, включая пустой массив.
>
> ```js
> // checked-example: promise-all
> function promiseAll(values) {
>   return new Promise((resolve, reject) => {
>     const items = Array.from(values);
>     if (items.length === 0) {
>       resolve([]);
>       return;
>     }
>     const result = new Array(items.length);
>     let remaining = items.length;
>     items.forEach((item, index) => {
>       Promise.resolve(item).then((value) => {
>         result[index] = value;
>         if (--remaining === 0) resolve(result);
>       }, reject);
>     });
>   });
> }
> ```
>
> Для входа `[медленный A, быстрый B]` ответ — `[A, B]`. Пустой вход сразу выполняет Promise со значением `[]`, но его `.then` всё равно вызывается асинхронно. Первый отказ отклоняет общий Promise; остальные операции продолжаются, их отказы тоже имеют обработчики.
>
> Это не ограничитель параллелизма: созданные запросы уже запущены. Для ограничения нужен [[Собеседования/Практика/JavaScript#Ограничение конкурентности|Promise pool]]. Хранение результатов требует O(n) памяти.

### Реализовать Promise.allSettled

Напишите `promiseAllSettled(values)` для массива обычных значений и Promise. Он ждёт завершения всех входов и возвращает результаты в исходном порядке: `{ status: 'fulfilled', value }` либо `{ status: 'rejected', reason }`. Отклонение одного входа не должно прерывать ожидание остальных. Пустой вход даёт `[]`; исходный массив не меняется. Вход другого типа отклоняет возвращённый Promise с TypeError.

Проверьте медленный успех перед быстрым отказом, несколько отказов, обычное значение и пустой массив. Объясните, чем эта функция отличается от ограничения числа одновременно выполняемых запросов.

> [!example]- Разбор
>
> Сохраняем отдельный результат для каждого индекса. Оба обработчика завершают соответствующую позицию; общий Promise выполняется после последней. Отказ входного Promise становится данными результата.
>
> ```js
> // checked-example: promise-all-settled
> function promiseAllSettled(values) {
>   return new Promise((resolve, reject) => {
>     if (!Array.isArray(values)) {
>       reject(new TypeError('Expected an array'));
>       return;
>     }
>     const items = Array.from(values);
>     if (items.length === 0) {
>       resolve([]);
>       return;
>     }
>     const results = new Array(items.length);
>     let remaining = items.length;
>     function finish(index, result) {
>       results[index] = result;
>       if (--remaining === 0) resolve(results);
>     }
>     items.forEach((item, index) => {
>       Promise.resolve(item).then(
>         (value) => finish(index, { status: 'fulfilled', value }),
>         (reason) => finish(index, { status: 'rejected', reason }),
>       );
>     });
>   });
> }
> ```
>
> Для `[медленный A, быстрый отказ B, 3]` получим успех A, отказ B и успех 3 именно в таком порядке. Пустой вход сразу выполняет Promise, но его `.then` вызывается через микрозадачу. Снимок входных значений через Array.from превращает пропуски массива в undefined и защищает состав входа от последующих изменений.
>
> Созданные операции уже могли начаться; функция не запускает их заново и не отменяет. Нужны O(n) памяти для результатов.
>
> Теория: [[Фронтенд/JavaScript/05. Асинхронность/03. Promise — статические методы|Сравнение статических методов Promise]]. Контракт результата: [MDN: allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled).

### Реализовать Promise.any

Реализуйте `promiseAny` для массива Promise: первый успех завершает результат, отказ всех операций даёт `AggregateError` с причинами в порядке входа. Остальные операции не отменяются. Проверьте пустой массив. Ниже — примеры требуемого результата.

```
const promiseAny = (promises) => {
   }

const resolve = (value, timeout) =>
  new Promise((res) => setTimeout(res, timeout, value))
const reject = (value, timeout) =>
  new Promise((_, rej) => setTimeout(rej, timeout, value));
promiseAny([resolve(1, 200), resolve(2, 100), resolve(3, 300)]).then(
  console.log) // 2
promiseAny([reject(1, 500), reject(2, 100), resolve(3, 200)]).then(
  console.log) // 3
promiseAny([reject(1, 300), reject(2, 100), reject(3, 200)]).catch(error => console.error(error.errors)) // [1, 2, 3]
```

[Контракт Promise.any](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any).

> [!example]- Разбор простыми словами
>
> Сохраняем ошибки по исходным индексам и считаем отказы. Первый успех завершает результат. Если отказали все, создаём AggregateError.
>
> ```js
> // checked-example: promise-any
> function promiseAny(values) {
>   return new Promise((resolve, reject) => {
>     const items = Array.from(values);
>     const errors = new Array(items.length);
>     let remaining = items.length;
>     if (!remaining) {
>       reject(new AggregateError([], 'No success'));
>       return;
>     }
>     items.forEach((item, index) => {
>       Promise.resolve(item).then(resolve, (error) => {
>         errors[index] = error;
>         if (--remaining === 0) reject(new AggregateError(errors, 'No success'));
>       });
>     });
>   });
> }
> ```
>
> После первого успеха остальные операции продолжаются, а их ошибки получают обработчики. В отличие от any, race завершится и от первого отказа.

### Последовательная очередь записи файла

Предоставленный `writeFile` отклоняет параллельные вызовы, пока предыдущая запись не завершена. Реализуйте `writeFileWrapper`, который принимает все вызовы и выполняет их по очереди. Код имитирует запись, реальная файловая система не используется.

Сохраните порядок и отдельный результат каждого вызова. Что делать с очередью после ошибки? Сравните явную очередь с цепочкой Promise.

```js
// здесь реализовано как IIFE, может быть отдельным модулем, нужно чтобы не было доступа к busy
const writeFile = (() => {
  let busy = false;

  return (...args) => {
    return new Promise((resolve, reject) => {
      if (busy) {
        reject(new Error("busy"));
        return;
      }

      busy = true;

      setTimeout(() => {
        busy = false;
        resolve(...args);
      }, 1000);
    });
  };
})();

//
//
//
//
//
//
//
//

const writeFileQueued = (...args) => {
  return writeFile(...args);
};

//
//
//
//
//
//
//
//
// тестовые вызовы
console.time("1");
writeFileQueued("foo", "bar").then(() => {
  console.timeEnd("1"); // ~ 1 секунда
});

console.time("2");
writeFileQueued("foo", "baz").then(() => {
  console.timeEnd("2"); // ~ 2 секунды
});

console.time("3");
writeFileQueued("foo").then(() => {
  console.timeEnd("3"); // ~ 3 секунды
});

console.time("4");
writeFileQueued("baz").then(() => {
  console.timeEnd("4"); // ~ 4 секунды
});
```

> [!example]- Разбор простыми словами
>
> Храни обработанный хвост очереди отдельно от результата текущего вызова:
>
> ```js
> let tail = Promise.resolve();
>
> function writeFileQueued(...args) {
>   const job = tail.then(() => writeFile(...args));
>   tail = job.catch(() => {});
>   return job;
> }
> ```
>
> Вызывающий получает настоящий отказ job. Отдельный обработанный хвост позволяет следующей независимой записи стартовать после ошибки. Если по условиям ошибка должна остановить всю очередь, не восстанавливай хвост автоматически. Запуск writeFile должен находиться внутри then, иначе запись начнётся до своей очереди.

### Последовательные POST: передача данных и ошибки

Проверьте приведённую реализацию: передаётся ли `initialData` в первый запрос, правильно ли передаётся следующий результат и не скрывает ли `catch` сбой? Код служит для ревью.

```js
chainRequests(
  { data: "initial data" },
  "https://host.com/1",
  "https://host.ru/2",
  "https://host.ru/3",
  "https://host.ru/3",
);
```

```Js
async function chainRequests(initialData, ...urls) {

    let currentData = null;

    for (const url of urls) {

        try {

            // Выполняем запрос с текущими данными

            const response = await fetch(url, {

                method: 'POST', // Предполагается, что вы хотите отправлять данные методом POST

                headers: {

                    'Content-Type': 'application/json',

                },

                body: currentData ? JSON.stringify(currentData) : undefined,

            });

            // Проверяем корректность ответа

            if (!response.ok) {

                throw new Error(`Ошибка при запросе к ${url}: ${response.statusText}`);

            }

            // Получаем данные из ответа

            currentData = await response.json();

        } catch (error) {

            console.error(error);

            break; // Останавливаем цикл в случае ошибки

        }

    }

    return currentData; // Возвращаем данные последнего ответа

}
```

> [!example]- Разбор простыми словами
>
> Начни с `let currentData = initialData`. Передавай `JSON.stringify(currentData)`, а не проверяй его истинность: 0 и false тоже данные. После успешного HTTP-ответа прочитай JSON и передай его следующему запросу.
>
> Текущий catch только пишет лог и возвращает частичный результат как успех. Если ошибка должна прервать цепочку с отказом, выброси её дальше или убери catch. Последовательность здесь оправдана зависимостью запросов. Повтор POST требует отдельного соглашения об идемпотентности.

### Повторное выбрасывание ошибки в цепочке Promise

```Js
new Promise(res => res())
    .then(() => {
        throw new Error('Ошибка')
        console.log(2)
    })
    .catch(err => {
        console.log(1)
        throw err
    })
    .then(() => console.log(3))
    .catch(() => console.log(4))
    .then(() => console.log(5))
    .catch(() => console.log(6))

```

> [!example]- Разбор
>
> Вывод: 1, 4, 5. Первый then бросает ошибку, поэтому console.log(2) недостижим. Первый catch печатает 1 и снова бросает ошибку: следующий успешный then с 3 пропускается. Второй catch печатает 4 и возвращает undefined без ошибки, поэтому цепочка восстанавливается и следующий then печатает 5. Последний catch с 6 не вызывается.
>
> Каждый then/catch создаёт новый Promise; состояние следующего звена определяется возвращённым значением или исключением обработчика. Проверить понимание можно заменой второго catch на throw: тогда 5 пропустится, а 6 выполнится. Отсутствие return в обработчике не останавливает цепочку — оно даёт успешный undefined.
### Микрозадачи между обработчиками таймеров

Выполняйте два примера отдельно. В первом вызовите `run()` после объявления; без вызова тела не будет вывода. Объясните постановку таймеров и обработку ошибок.

```Js
const run = () => {

    setTimeout(() => {

        console.log('timeOut');

    }, 0);

    console.log(1);

    new Promise((resolve, reject) => {

        console.log('Promise');

        setTimeout(() => { // Макрозадача, которая генерирует микрозадачи

            console.log('777');

            resolve(); // сработает ли, если вызвать выше reject() ?

        }, 0);

    })

        .then(() => {

            console.log('then1');

        })

        .then(() => {

            console.log('then2');

        })

        .catch((err) => console(err)) // что будет в err ?

        .then(() => console.log('foo'))

        .finally(() => {

            // когда сработает finally ?

        });

    console.log(4);

    setTimeout(() => {

        console.log('timeOut2');

    }, 0);

};

// 1 Promise 4 timeOut 777 then1 then2 foo timeOut2

// Немного другой вариант
setTimeout(() => {

    console.log("timeOut");

}, 0)

console.log(1);

new Promise(resolve => {

    console.log("Promise");

    setTimeout(() => {

        console.log("777");

        resolve()

    }, 0)

}).then(() => {

    setTimeout(() => {

        console.log("then1");

    }, 0)

}).then(() => {

    console.log("then2");

})

console.log(4);

setTimeout(() => {

    console.log("timeOut2");

}, 0)
```

> [!example]- Разбор простыми словами
>
> В обычном браузерном запуске первый пример выводит: 1, Promise, 4, timeOut, 777, then1, then2, foo, timeOut2. finally выполняется после foo, но ничего не выводит. Микрозадачи от resolve завершаются до следующего таймера.
>
> Второй пример: 1, Promise, 4, timeOut, 777, then2, timeOut2, then1. Здесь then1 — новый таймер, а не немедленная запись из Promise callback.
>
> Если Promise сначала отклонить, последующий resolve его не изменит. `console(err)` — отдельная ошибка: console не функция; используй console.error(err).

### Синхронный код и продолжение после await

Замените '?' последовательными номерами по реальному порядку вывода. Объясните задачи/микрозадачи.

```js
function checkOrder() {
  console.log('?');
  async function asyncFn() {
    console.log('?');
    await Promise.resolve(null);
    console.log('?');
  }
  asyncFn();
  new Promise((resolve) => {
    setTimeout(() => { resolve(); console.log('?'); }, 0);
  }).then(() => { console.log('?'); });
  console.log('?');
}
checkOrder();
```

> [!example]- Разбор — базовое решение
>
> Номера в исходных позициях: **1, 2, 4, 5, 6, 3**. По времени: вход в checkOrder → часть asyncFn до await → последний log checkOrder → продолжение asyncFn → log таймера → then результата таймера.
>
> Вызов asyncFn начинает выполнять её тело сразу. await уже выполненного Promise всё равно откладывает продолжение. Executor `new Promise(...)` также выполняется синхронно, но здесь только регистрирует таймер. После завершения синхронного кода микрозадача продолжает asyncFn. Позже срабатывает таймер: resolve ставит обработчик then в очередь, но сначала заканчивается текущий обработчик таймера вместе с console.log. Затем выполняется then.
>
> Измените условие: перенесите последний синхронный log перед asyncFn. Новый порядок первых шагов должен следовать порядку обычных вызовов; async не превращает всё тело функции в отложенную задачу. Вывод относится к этому браузерному примеру; таймер 0 не гарантирует точное время запуска.

**Критерии ответа:** Предсказываю порядок, объясняю синхронность executor и работу очереди после await и resolve таймера.

**Изучить:** [[Фронтенд/JavaScript/05. Асинхронность/04. async-await|Объяснение и примеры]]

## Коллекции и преобразование данных

### Глубокое копирование: контракт и проверочные примеры

Реализуйте deepCopy(obj). Изменения копии и исходного объекта должны быть независимы. Сначала согласуйте поддерживаемые типы, циклы и сохранение прототипа. Обсудите ограничения JSON-копирования и structuredClone.

**Уточнение условия:** реализуйте рекурсивную deepCopy для примитивов, обычных объектов с Object.prototype или null-прототипом и обычных массивов из той же среды выполнения.

Копируются собственные перечисляемые строковые свойства-данные; длина и пропуски массива сохраняются. Символьные ключи и неперечисляемые свойства в контракт не входят.

Общие ссылки и циклы сохраняют структуру графа, но все поддерживаемые объекты копии должны отличаться от объектов исходника.

Функции, экземпляры классов, Date/Map/Set и перечисляемые getters/setters отвергаются. Proxy и изменение исходника во время обхода исключены. Дескрипторы readonly/frozen не сохраняются: копия изменяемая. Глубина рекурсии ограничена стеком вызовов.

```js
function deepCopy(obj) {
  // Ваш код
}
const nullProto = Object.create(null);
const copyNullProto = deepCopy();
console.assert(copyNullProto !== nullProto, 'Копия не должна быть той же ссылкой');
const obj = { a: 1, b: { c: 2, d: [3, 4] } };
const copyObj = deepCopy(obj);
console.assert(copyObj !== obj);
console.assert(copyObj.b !== obj.b);
console.assert(copyObj.b.d !== obj.b.d);
console.assert(JSON.stringify(copyObj) === JSON.stringify(obj));
const arr = [{ a: 1, b: 2 }, [3, 4]];
const copyArr = deepCopy(arr);
console.assert(copyArr !== arr);
console.assert(copyArr[0] !== arr[0]);
console.assert(copyArr[1] !== arr[1]);
console.assert(JSON.stringify(copyArr) === JSON.stringify(arr));
```

**Ошибка проверочного кода:** deepCopy() вызвана без nullProto; такой assert не проверяет сохранение null-прототипа. Предложите правильную проверку.

> [!note]- Подсказка
> проверка массива и объекта, typeof, instanceof и разные realms; символы, accessors, функции, Map/Set, Date и циклы.

> [!example]- Рекурсивная копия с ограниченным контрактом
>
> Сначала отделяем примитив, затем создаём пустую копию контейнера. Таблица исходный объект → копия заполняется **до** обхода детей: повторная ссылка получает уже созданную копию. Поэтому цикл замыкается внутри нового графа, а общее поддерево не дублируется.
>
> ~~~js
> // checked-example: bounded-deep-copy
> function deepCopy(input) {
>   const copies = new WeakMap();
>   function clone(value) {
>     if (typeof value === 'function') throw new TypeError('Functions are unsupported');
>     if (value === null || typeof value !== 'object') return value;
>     if (copies.has(value)) return copies.get(value);
>
>     const proto = Object.getPrototypeOf(value);
>     const array = Array.isArray(value);
>     if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
>       throw new TypeError('Unsupported object prototype');
>     }
>     const result = array ? new Array(value.length) : Object.create(proto);
>     copies.set(value, result);
>     for (const key of Object.keys(value)) {
>       const descriptor = Object.getOwnPropertyDescriptor(value, key);
>       if (!Object.hasOwn(descriptor, 'value')) {
>         throw new TypeError('Accessors are unsupported');
>       }
>       Object.defineProperty(result, key, {
>         value: clone(descriptor.value),
>         enumerable: true, writable: true, configurable: true,
>       });
>     }
>     return result;
>   }
>   return clone(input);
> }
> ~~~
>
> Чтение дескриптора не вызывает getter. defineProperty создаёт собственное поле даже для ключа `__proto__`, не меняя прототип результата. Object.keys определяет границу свойств, которые мы копируем; это не копирование всех возможных свойств JavaScript-объекта.
>
> Инвариант: каждому уже встреченному контейнеру соответствует ровно одна новая копия. При обработке его свойства ссылка заменяется копией того же значения. Для V контейнеров и E просматриваемых свойств время O(V + E), результат и таблица требуют O(V + E) памяти; стек вызовов дополнительно зависит от максимальной глубины. Для чрезмерно глубокой цепочки рекурсивное решение всё ещё может переполнить стек — WeakMap решает циклы, а не эту проблему.
>
> Исправленная проверка исходного примера:
>
> ```js
> const copyNullProto = deepCopy(nullProto);
> console.assert(copyNullProto !== nullProto);
> console.assert(Object.getPrototypeOf(copyNullProto) === null);
> ```
>
> Одного сравнения ссылок или JSON.stringify недостаточно: JSON не проверяет прототип, пропуски и структуру общих ссылок.
>
> Проверьте вложенный объект/массив, null, undefined и BigInt; независимость после изменения копии; общий дочерний объект; цикл; null-прототип; пропуск массива; собственный `__proto__`; отказ для Date и getter без запуска getter.
>
> Источники: [Object.keys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys), [перечисляемость и владение свойствами](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Enumerability_and_ownership_of_properties), [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone).

> [!example]- Ограничения стандартных способов
>
> JSON.stringify бросает на циклах и BigInt; свойства с undefined/функциями/символами пропускаются, в массиве такие значения становятся null. Date сериализуется в строку. structuredClone сохраняет многие встроенные типы и циклы, но функции не клонирует. Это разные контракты, а не универсальная взаимозаменяемая реализация.
>

### Значения, встречающиеся ровно один раз

Проверьте реализацию `findUnique`: она возвращает значения, встречающиеся **ровно один раз**, а не все различные значения массива. Объясните сравнение объектов по ссылке, стоимость вложенного поиска и альтернативу через Map. Обсудите риск добавления метода в Array.prototype.

```Js
Array.prototype.findUnique = function () {

    const map = new Map();

    for (const item of this) {

       if (map.has(item)) {

        map.set(item, map.get(item) + 1)

       } else {

        map.set(item, 1)

       }

    }

    const uniqueElements = [];

    for (const el of this) {

        if (map.get(el) === 1) {

            uniqueElements.push(el)

        }

    }

    return uniqueElements

}

const objA = {name: 'Test', value: 2};

const objB = objA;

const objC = {name: 'Test', value: 2};

const numbers = [1, 2, 3, 1, 2, 4, 5, 5, 6, objA, objB, objC];

const res = numbers.findUnique();
```

> [!example]- Разбор простыми словами
>
> Результат: 3, 4, 6 и objC. objA и objB — одна ссылка, она встречается дважды; objC — отдельный объект, несмотря на одинаковые поля.
>
> В показанной реализации уже два линейных прохода через Map, а не вложенный поиск. При обычной модели Map это O(n) времени и O(k) памяти. Оформи отдельную функцию вместо изменения Array.prototype: чужой код может зависеть от его свойств.

### Преобразование входного массива

В этой задаче value содержит только латинские буквы a–z и цифры 0–9. Отберите непросроченные записи, отсортируйте по возрастанию order и разверните символы каждого value. Соберите строку без цифр и повторяющихся букв: уже добавленная буква больше не включается.
```Javascript
const input = [
  {value: 'q1we3q1', order: 4, expired: false},
  {value: 'as2dq43', order: 2, expired: true},
  {value: 'j8k0ri2', order: 1, expired: false},
  {value: 'oiod127', order: 3, expired: false},
];
```

> [!example]- Проверка после самостоятельной попытки
>
> ```js
> function processInput(input) {
>   const sortedInput = input
>     .filter((item) => !item.expired)
>     .sort((a, b) => a.order - b.order);
>   const resultString = sortedInput.reduce((result, item) => {
>     const reversedValue = item.value.split('').reverse();
>
>     reversedValue.forEach((char) => {
>       if (!/[0-9]/.test(char) && !result.includes(char)) {
>         result += char;
>       }
>     });
>
>     return result;
>   }, '');
>
>   return resultString;
> }
>
> // Результат
> console.log(processInput(input)); // irkjdoqew
> ```
>

## Функции, объекты и интерфейсы

### Мемоизация функции с очисткой кэша

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Кэширую по одному примитивному аргументу через Map, сохраняю undefined и другие falsy-результаты; clearCache заставляет вычислить заново, синхронные ошибки не кэширую.
**Изучить:** [[Фронтенд/JavaScript/07. Массивы и коллекции/03. Map, Set, WeakMap и WeakSet|Ключи и наличие записи в Map]]

Необходимо реализовать memoize, которая принимает на вход функцию и возвращает её замемоизированную версию, которая запоминает результаты её работы. При последующих вызовах с теми же аргументами, функция должна будет взять результат из кэша, вместо повторного вызова.
• В качестве входного параметра для мемоизированной функции ограничимся одним аргументом любого примитивного типа.
• У мемоизированной функции должен быть метод для очистки её кэша

Функция синхронная и зависит только от аргумента, не от this или внешнего состояния. Ключи сравниваются как в Map: число `1` и строка `'1'` различаются, два `NaN` — один ключ. Пример: для `memoize(x => x * 2)` вызовы с `5` дважды дают `10`, но исходная функция работает один раз; после очистки следующий вызов вычисляет результат снова.

```
memoizedFn.clearCache()
const memoize = (fn) => {
    // TODO
};
```

> [!example]- Разбор мемоизации
>
> Кэш — это таблица «аргумент → результат». Проверяем наличие ключа через `has`: сохранённый результат может быть `undefined`, `0` или `false`.
>
> Условие: функция зависит только от одного примитивного аргумента, не от `this` или меняющегося внешнего состояния.
>
> ```js
> // checked-example: memoize
> function memoize(fn) {
>   const cache = new Map();
>   function memoized(value) {
>     if (cache.has(value)) return cache.get(value);
>     const result = fn(value);
>     cache.set(value, result);
>     return result;
>   }
>   memoized.clearCache = () => cache.clear();
>   return memoized;
> }
> ```
>
> Например, второй вызов `memoized(5)` берёт прежний результат, после `clearCache()` значение вычисляется заново. Синхронная ошибка не попадает в кэш.
>
> Без очистки кэш растёт вместе с числом разных ключей, поэтому нужно выбрать срок его хранения. Кэширование Promise требует отдельного решения о повторе после отказа — см. [[Собеседования/Практика/JavaScript#Deduplication запросов|объединение одинаковых запросов]].

### Освобождаемые события (Disposable)

Необходимо реализовать класс для управления освобождаемыми событиями (disposable).
Требования:
• Управляет событиями для конкретного DOM-элемента
• В случае, если элемент удален из DOM - автоматически отписывает все события
• Метод добавления подписки - создает слушатель события для элемента, возвращает коллбек отписки. Доп. требования
• автоотписка события после вызова N раз (передается как параметр события)
• автоотписка события по истечению времени (передается как параметр события)
• автоотписка что наступит раньше - или N кликов, или таймер

> [!example]- Разбор простыми словами
>
> Самая простая модель — явный dispose: хранить зарегистрированные слушатели и их настройки, а при освобождении удалить их и очистить таймеры. Для N вызовов уменьшается счётчик; для времени ставится таймер; оба пути вызывают один идемпотентный dispose.
>
> Само удаление элемента не вызывает произвольный dispose автоматически. Для требования автоопределения удаления нужен согласованный наблюдаемый контейнер и MutationObserver либо интеграция с жизненным циклом. Сам observer тоже нужно отключать. Ссылка обработчика на элемент сама по себе не вызывает утечку: если вся группа объектов недоступна, сборщик мусора может её удалить.
>
> Ниже элемент уже находится в обычном DOM своего document, без Shadow DOM. Удаление означает отсутствие элемента в этом document к моменту проверки: перенос внутри документа за одну синхронную операцию не завершает владельца. MutationObserver замечает удаление асинхронно; обработчик дополнительно проверяет принадлежность перед доставкой события.
>
> ~~~js
> class Disposable {
>   #element;
>   #root;
>   #observer;
>   #cleanups = new Set();
>   #disposed = false;
>   constructor(element) {
>     this.#root = element.ownerDocument;
>     if (!this.#root.contains(element)) throw new Error('Element must be attached');
>     this.#element = element;
>     this.#observer = new MutationObserver(() => {
>       if (!this.#root.contains(this.#element)) this.dispose();
>     });
>     this.#observer.observe(this.#root, { childList: true, subtree: true });
>   }
>   on(type, callback, { count = Infinity, timeout, capture = false } = {}) {
>     if (this.#disposed) throw new Error('Already disposed');
>     if (typeof callback !== 'function') throw new TypeError('Expected callback');
>     if (count !== Infinity && (!Number.isInteger(count) || count < 1)) {
>       throw new RangeError('Invalid count');
>     }
>     if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0 || timeout > 2147483647)) {
>       throw new RangeError('Invalid timeout');
>     }
>     let active = true;
>     let timer;
>     let remaining = count;
>     const off = () => {
>       if (!active) return;
>       active = false;
>       this.#element.removeEventListener(type, handler, capture);
>       clearTimeout(timer);
>       this.#cleanups.delete(off);
>     };
>     const handler = event => {
>       if (!this.#root.contains(this.#element)) { this.dispose(); return; }
>       if (!active || this.#disposed) return;
>       if (--remaining === 0) off();
>       callback.call(this.#element, event);
>     };
>     this.#element.addEventListener(type, handler, capture);
>     this.#cleanups.add(off);
>     if (timeout !== undefined) timer = setTimeout(off, timeout);
>     return off;
>   }
>   dispose() {
>     if (this.#disposed) return;
>     this.#disposed = true;
>     this.#observer.disconnect();
>     for (const off of this.#cleanups) off();
>   }
> }
> ~~~
>
> На последнем разрешённом вызове off выполняется до callback: рекурсивный dispatchEvent не вызовет подписку ещё раз. Отписка одной подписки не закрывает остальные. Проверки: N=1 и N=2, рекурсивный dispatch, таймер раньше N, ручная двойная отписка, удаление самого элемента или предка, перенос внутри document и повторный dispose. Для большого числа владельцев лучше один общий observer либо уже имеющийся lifecycle компонента.


### fetchRetry с задержкой

**Формат раунда:** coding
**Этап кода:** main
**Критерии ответа:** Считаю общее число попыток, делаю паузу только перед повтором, повторяю сетевые/408/429/5xx ошибки; 404 и ошибка JSON завершают вызов без повтора, после исчерпания возвращаю последнюю ошибку.
**Изучить:** [[Фронтенд/JavaScript/05. Асинхронность/06. Паттерны асинхронного кода|Повторы и последовательное ожидание]]

Реализуй `fetchRetry(url, attempts, delayMs)`: выполнить GET-запрос, при временном сбое подождать и повторить. `attempts` — общее число попыток, включая первую. Успех возвращает JSON, исчерпание попыток — последнюю ошибку.

По условию повторяем сетевую ошибку, HTTP 408, 429 и 5xx; остальные HTTP-ошибки и ошибку разбора JSON не повторяем. Задержка фиксированная. Например, при `attempts = 3` возможны три запроса и две паузы.

> [!example]- Разбор повтора GET-запроса
>
> Неудачный HTTP-статус сам по себе не отклоняет Promise от `fetch`. Поэтому проверяем отдельно: удалось ли получить ответ и разрешён ли повтор его статуса.
>
> ```js
> // checked-example: fetch-retry
> async function fetchRetry(url, attempts = 3, delayMs = 300) {
>   if (
>     !Number.isInteger(attempts) ||
>     attempts < 1 ||
>     !Number.isFinite(delayMs) ||
>     delayMs < 0
>   ) {
>     throw new RangeError('Invalid retry settings');
>   }
>   for (let attempt = 1; attempt <= attempts; attempt++) {
>     let response;
>     let error;
>     try {
>       response = await fetch(url, { method: 'GET' });
>     } catch (cause) {
>       error = cause;
>     }
>     if (response?.ok) return response.json();
>     if (response) {
>       error = new Error(`HTTP ${response.status}`);
>       const retryable =
>         response.status === 408 ||
>         response.status === 429 ||
>         response.status >= 500;
>       if (!retryable) throw error;
>     }
>     if (attempt === attempts) throw error;
>     await response?.body?.cancel();
>     await new Promise((resolve) => setTimeout(resolve, delayMs));
>   }
> }
> ```
>
> Сначала проверь: успех с первого раза; 503 → успех; постоянный 503; 404 без повтора; некорректный JSON без повтора. В тесте подставляй управляемый `fetch`, а не случайный внешний сервер.
>
> **Ограничение:** сетевой отказ может быть постоянным, например из-за CORS. Повтор не исправляет причину. Запрос создания заказа нельзя автоматически повторять по этому же правилу: сервер мог выполнить его до обрыва связи.

> [!note]- Если попросят подробнее
>
> Добавь AbortSignal, общий срок выполнения и увеличивающуюся задержку с небольшим случайным разбросом. Учитывай Retry-After. Заранее реши, что ограничивает повтор: число попыток или общий срок. Эти требования полезны для production-клиента, но не должны скрывать основную идею цикла.

### EventEmitter: on/off/emit и цепочка вызовов

Реализуйте подписку на разные события, отписку и оповещение всех подписчиков. Методы должны поддерживать цепочку из примера.

```js
class EventEmitter {
  // Ваш код
}
const emitter = new EventEmitter();
const cb1 = () => console.log('cb1');
const cb2 = () => console.log('cb2');
emitter
  .on('event', cb1)
  .on('event', cb2)
  .emit('event') // cb1, cb2
  .off('event', cb2)
  .emit('event'); // cb1
```

> [!note]- Подсказка
> исключение в обработчик, аргументы emit, повторная подписка, изменение подписок во время обхода.

> [!example]- Разбор EventEmitter
>
> Для каждого имени события храним список функций. `emit` передаёт им аргументы, `off` удаляет одну первую совпавшую подписку. Повторная подписка разрешена. Методы возвращают `this`, как требует условие с цепочкой.
>
> ```js
> // checked-example: emitter
> class EventEmitter {
>   #events = new Map();
>   on(name, handler) {
>     const handlers = this.#events.get(name) ?? [];
>     handlers.push(handler);
>     this.#events.set(name, handlers);
>     return this;
>   }
>   off(name, handler) {
>     const handlers = this.#events.get(name);
>     const index = handlers?.indexOf(handler) ?? -1;
>     if (index !== -1) handlers.splice(index, 1);
>     if (handlers?.length === 0) this.#events.delete(name);
>     return this;
>   }
>   emit(name, ...args) {
>     for (const handler of [...(this.#events.get(name) ?? [])]) {
>       handler(...args);
>     }
>     return this;
>   }
> }
> ```
>
> Копия списка при `emit` делает поведение понятным: добавление и удаление подписок внутри обработчика повлияет на следующий `emit`. В этой версии исключение обработчика прерывает текущую рассылку и передаётся вызывающему коду.
>
> Если `on` должен возвращать отписку, возвращаем функцию `() => off(...)`. Тогда цепочка вызовов из условия уже не работает — нужно выбрать один из этих вариантов API. Если одна функция может подписаться несколько раз, для независимой отписки храним отдельную запись каждой подписки.

## Управление запросами

Обсуди актуальность, завершение Promise, порядок и очистку ресурсов.

### Ограничение конкурентности

Реализовать `runWithLimit(tasks, limit)`, которая выполняет функции, возвращающие Promise, не более чем по `limit` одновременно и сохраняет порядок результатов.

Обсудить ошибку одной задачи, некорректный `limit` и возможность отмены.

**Условия.** `tasks` — плотный массив функций без аргументов, `limit` — положительное целое число. Сами функции запускает пул; уже созданные Promise ограничить задним числом нельзя. Пустой массив даёт `[]`. При первой замеченной ошибке результат отклоняется, новые задачи больше не запускаются. Уже запущенные операции продолжаются, их завершения обрабатываются. Изменение входного массива после вызова не меняет состав работы.

Пример: A, B, C выполняются за разное время, `limit = 2`. Сначала работают A и B; если B завершилась раньше, C начинается сразу, не ожидая A. Результат всё равно `[resultA, resultB, resultC]`. Сначала опиши владельца следующего индекса и способ остановки запуска, затем напиши решение.

> [!example]- Разбор Promise pool
>
> Создаём не пачки по два элемента, а до `limit` работников. Каждый берёт следующий индекс до своего первого await и после завершения берёт ещё один. На одном JS-потоке это получение индекса не прерывается другим работником. Отдельный индекс результата сохраняет порядок входа независимо от скорости операций.
>
> ```js
> // checked-example: promise-pool
> async function runWithLimit(tasks, limit) {
>   if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
>   if (!Number.isInteger(limit) || limit < 1) {
>     throw new RangeError('limit must be a positive integer');
>   }
>   const jobs = [...tasks];
>   for (const job of jobs) {
>     if (typeof job !== 'function')
>       throw new TypeError('task must be a function');
>   }
>   const results = new Array(jobs.length);
>   let next = 0;
>   let failed = false;
>
>   async function worker() {
>     while (!failed && next < jobs.length) {
>       const index = next++;
>       try {
>         results[index] = await jobs[index]();
>       } catch (error) {
>         failed = true;
>         throw error;
>       }
>     }
>   }
>
>   const count = Math.min(limit, jobs.length);
>   await Promise.all(Array.from({ length: count }, () => worker()));
>   return results;
> }
> ```
>
> `try/await` перехватывает и синхронный throw задачи, и rejection. Promise.all подписан на всех работников: поздняя ошибка уже запущенной операции тоже обработана. `failed` останавливает следующий запуск после наблюдения ошибки; он не отменяет сетевой запрос. Для настоящей отмены контракт нужно расширить сигналом, который понимает сама задача.
>
> **Проверка без случайных задержек.** Возьми A и B с управляемыми Promise, запусти пул с лимитом 2. Проверь, что C ещё не вызвана. Заверши B — C должна начаться, хотя A ещё pending. Заверши C, затем A: результаты остаются в порядке A, B, C. Для ошибки отклони A, пока B pending: C не запускается; отдельно отклони B и убедись, что нет необработанного rejection. Также проверь пустой вход, лимит 1, лимит больше числа задач, неверный лимит и синхронный throw.
>
> Накладные расходы пула — O(n) времени и O(n) памяти для снимка задач/результатов, плюс до O(min(limit, n)) работников. Это не оценка работы внутри задач. `Promise.all(tasks.map(fn => fn()))` запускает всё сразу; последовательный await в одном цикле ограничивает параллелизм единицей; ожидание целой пачки удерживает освободившееся место до самой медленной задачи.
>
> **Усложнение.** Сделай режим all-settled с результатом `{ status, value/reason }` по каждому индексу. Реши, как отличать отказ задачи от общей отмены и кто владеет AbortController. Если одна задача завершается ошибкой, отдельно оговори, продолжает ли очередь остальные задачи.

### Deduplication запросов

Реализовать обёртку, возвращающую один и тот же pending Promise для одинакового ключа. После завершения запись должна корректно очищаться.

> [!example]- Разбор: один запрос для одинакового ключа
>
> Сохраняем выполняющийся Promise сразу, а не после `await`. Тогда второй вызов успеет его найти. После успеха или ошибки запись удаляется: следующий вызов начнёт новую работу.
>
> ```js
> // checked-example: dedupe
> function dedupe(load) {
>   const pending = new Map();
>   return function get(key) {
>     if (pending.has(key)) return pending.get(key);
>     const promise = Promise.resolve().then(() => load(key));
>     pending.set(key, promise);
>     const clear = () => {
>       if (pending.get(key) === promise) pending.delete(key);
>     };
>     promise.then(clear, clear);
>     return promise;
>   };
> }
> ```
>
> Два вызова `get('u1')` до завершения получают один и тот же Promise. После завершения новый вызов снова вызывает `load`. Синхронный throw внутри `load` становится отказом Promise.
>
> Ключ должен учитывать всё, что меняет результат: например, организацию и пользователя. Один потребитель не должен отменять общий запрос для остальных. Если нужен кэш готовых данных, это уже другой срок хранения.

### Cache с TTL

Реализовать минимальный async-cache по ключу. Уточнить TTL, повторный запрос после ошибки, ручную invalidation и защиту от параллельных miss.

> [!example]- Разбор TTL-кэша без лишних механизмов
>
> Кэш готового результата хранит `{ value, expiresAt }`. Пока `Date.now() < expiresAt`, возвращаем значение; иначе удаляем запись и загружаем заново.
>
> Для одновременных обращений дополнительно нужна таблица выполняющихся запросов из предыдущего разбора. После успеха запиши результат и срок годности; после отказа очисти только выполняющийся запрос. Время жизни результата удобно отсчитывать от успешного завершения загрузки.
>
> TTL сам по себе не ограничивает память: записи без повторных обращений могут оставаться в Map. Для длительно живущего кэша нужен предел числа записей или очистка истёкших. Если invalidation происходит во время запроса, старый ответ не должен восстановить удалённое значение: сравни поколение записи перед сохранением.
>
> Минимальный контракт: get всегда возвращает Promise; TTL отсчитывается от успеха, ошибка не кешируется. invalidate удаляет и значение, и право текущего запроса наполнить кеш. Уже ожидающие его потребители всё ещё получают его результат.
>
> ~~~js
> // checked-example: ttl-cache
> function createAsyncCache(load, ttl, now = () => performance.now()) {
>   if (!Number.isFinite(ttl) || ttl < 0) throw new RangeError('Invalid TTL');
>   const entries = new Map();
>   function get(key) {
>     const previous = entries.get(key);
>     if (previous?.pending) return previous.pending;
>     if (previous && now() < previous.expiresAt) {
>       return Promise.resolve(previous.value);
>     }
>     const entry = {};
>     const pending = Promise.resolve().then(() => load(key)).then(
>       value => {
>         if (entries.get(key) === entry) {
>           entry.value = value;
>           entry.expiresAt = now() + ttl;
>           delete entry.pending;
>         }
>         return value;
>       },
>       error => {
>         if (entries.get(key) === entry) entries.delete(key);
>         throw error;
>       },
>     );
>     entry.pending = pending;
>     entries.set(key, entry);
>     return pending;
>   }
>   return { get, invalidate: key => entries.delete(key), clear: () => entries.clear() };
> }
> ~~~
>
> Сравнение объекта entry служит проверкой поколения без отдельного счётчика. Проверь два одновременных miss, кеширование undefined, границу now === expiresAt, повтор после ошибки и сценарий A → invalidate → B → поздний A: старый ответ не должен заменить B. В тесте передавай управляемые часы через now.


### Очередь отправки

Пользователь может быстро инициировать несколько изменений одной сущности. Спроектировать последовательную отправку, видимый pending state и поведение после ошибки.

> [!example]- Разбор простыми словами
>
> Для одной сущности запускай следующую запись после завершения предыдущей; для разных сущностей очереди могут быть независимыми. На ошибке зависимые записи часто нужно остановить и показать пользователю, что не сохранено.
>
> При потере ответа неизвестно, выполнил ли сервер запись. Согласуй ключ операции и получение её статуса; слепой повтор может создать дубль. Механизм: [[Фронтенд/Инженерные основы/10. Данные и надёжность/02. Очереди, повторы и неопределённый результат|повтор и неизвестный результат]].

### Debounce

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Запускаю только последний отложенный вызов после полной паузы, сохраняю последние аргументы и this; повторное использование после срабатывания работает. Не обещаю отмену уже начавшейся операции.
**Изучить:** [[Фронтенд/JavaScript/05. Асинхронность/07. Debounce и throttle#Debounce|Отложенный вызов и таймер]]

Реализуй `debounce(fn, delay)` с сохранением this и аргументов. Каждый вызов возвращённой функции откладывает выполнение fn до конца паузы после последнего вызова. Выполняется только последний вызов (trailing). delay — конечное неотрицательное число миллисекунд; fn синхронная. Возвращённая функция сразу возвращает undefined. Возврат результата fn, cancel и flush в базовую задачу не входят.

Пример: вызовы на 0, 100 и 200 мс при delay = 300 дают один вызов fn примерно на 500 мс с аргументами и this последнего вызова. При delay = 0 вызов всё равно откладывается на таймер, а не выполняется синхронно.

> [!example]- Как разобрать debounce
>
> Пример: вызовы на 0, 100 и 200 мс, пауза 300 мс. Функция вызывается один раз примерно на 500 мс, с последними аргументами. Каждый новый вызов отменяет прежний таймер.
>
> ```js
> // checked-example: debounce
> function debounce(fn, delay) {
>   let timer;
>   return function (...args) {
>     clearTimeout(timer);
>     timer = setTimeout(() => {
>       timer = undefined;
>       fn.apply(this, args);
>     }, delay);
>   };
> }
> ```
>
> Обычная функция получает this от вызывающей стороны, а стрелка таймера сохраняет его. При частых вызовах откладывается один таймер. Ошибка fn возникает в отложенном обработчике; её нельзя поймать try/catch вокруг уже завершившегося вызова обёртки.
>
> Готовая небольшая реализация, `cancel` и объяснение `this`: [[Фронтенд/JavaScript/05. Асинхронность/07. Debounce и throttle#Debounce|изучить debounce]]. `cancel` очищает ожидание при закрытии компонента. Это не отменяет уже отправленный запрос и не защищает от старого ответа.

### Throttle

Реализовать `throttle(fn, interval)` и заранее договориться о leading/trailing поведении.

> [!example]- Как разобрать throttle
>
> Базовый вариант вызывает функцию сразу и пропускает события до конца интервала. Вызовы на 0, 100 и 400 мс при интервале 300 мс дают вызовы на 0 и 400 мс. Это вариант leading без trailing.
>
> Реализация: [[Фронтенд/JavaScript/05. Асинхронность/07. Debounce и throttle#Throttle|изучить throttle]]. Если важно обработать последнее положение указателя даже после остановки событий, нужен trailing-вызов. Сначала назови этот контракт, затем добавляй таймер.

> [!followup]- Как сохранить последний вызов throttle и отменить ожидание?
>
> Задаю leading+trailing: при событиях A@0, B@20, C@70, D@130 и интервале 100 мс выполняются A@0, C@100 и D@200. Один вызов не дублируется в конце интервала. Сохраняю последние args/this, создаю не более одного таймера, считаю интервал от фактического выполнения. cancel удаляет таймер и ссылки на аргументы. Готовый код и граничные случаи: [[Фронтенд/JavaScript/05. Асинхронность/07. Debounce и throttle#Throttle с первым и последним вызовом|leading+trailing]].

Актуальность поиска: [[Собеседования/Практика/Vue#useFetch: реактивный адрес и состояния запроса|задача useFetch]] и [[Собеседования/Практика/Тестирование#Гонка запросов: старый ответ и старый finally|проверка гонки]]. После своей попытки используй [[Фронтенд/Инженерные основы/07. Тестирование/02. Проверка поиска с поздними ответами|запускаемый стенд]].

> [!example]- Критерии управления запросами
>
> - обработка resolve и reject;
> - отсутствие зависших Promise;
> - освобождение таймеров и удаление обработчиков событий;
> - порядок выполнения и гонки запросов;
> - явный контракт отмены;
> - разумное поведение при повторном вызове.

## Цепочки функций и управляемый Promise

### Сумма до пустого вызова

Напиши `sum(1, 2)(3)(4, 5)()`, результат — `15`. Аргументы — конечные числа. Пустой вызов завершает цепочку; цепочки можно сохранять и продолжать независимо.

> [!example]- Разбор цепочки
>
> Каждый непустой вызов возвращает новую функцию, которая помнит накопленную сумму. Отдельное замыкание на каждом шаге позволяет разветвлять цепочку.
>
> ```js
> // checked-example: sum-chain
> function sum(...values) {
>   function next(total) {
>     return (...args) => args.length
>       ? next(total + args.reduce((a, b) => a + b, 0))
>       : total;
>   }
>   return values.length ? next(values.reduce((a, b) => a + b, 0)) : 0;
> }
> ```
>
> `const base = sum(1); base(2)()` даёт 3, `base(5)()` — 6. Базовая функция не проверяет типы: они заданы условием. Это накопление аргументов до сигнала завершения, а не обязательная реализация currying с фиксированным числом параметров.

> [!followup]- Как вместо суммы написать curry для произвольной функции известной арности?
>
> Заранее фиксирую число аргументов и правило this. Каждый шаг хранит отдельный набор аргументов; при достижении arity вызываю fn, иначе возвращаю новую функцию. Для curry((a,b,c) => a+b+c) проверяю все группировки и независимые ветки. fn.length может быть меньше ожидаемой арности из-за default/rest: тогда arity задаётся явно. Полная реализация: [[Фронтенд/JavaScript/13. Функциональные паттерны/02. Currying, partial application, memoization и decorators#Функция curry с известным числом аргументов|curry и контракт завершения]].

### Pipe: результат одной функции передать следующей

**Формат раунда:** coding
**Этап кода:** short
**Критерии ответа:** Передаю результат слева направо, пустая цепочка сохраняет вход; синхронная ошибка прерывает последующие шаги. Не смешиваю контракт с async-композицией.
**Изучить:** [[Фронтенд/JavaScript/13. Функциональные паттерны/01. Функции высшего порядка и композиция|Композиция функций]]

Напиши `pipe(...functions)`: функции синхронные, каждая принимает одно значение. Пустая цепочка возвращает исходное значение. Пример: `pipe(x => x + 1, x => x * 2)(3)` → `8`.

> [!example]- Разбор pipe
>
> Идём слева направо: текущий результат становится аргументом следующего шага.
>
> ```js
> // checked-example: pipe
> function pipe(...functions) {
>   return value => functions.reduce((result, fn) => fn(result), value);
> }
> ```
>
> Здесь вычисление занимает O(k) вызовов для k функций. Синхронная ошибка прерывает цепочку. Для асинхронных шагов нужно явно договориться, что результат всегда Promise, и ожидать каждый шаг; не смешивай этот контракт с текущим.
>
> Механизм: [[Фронтенд/JavaScript/13. Функциональные паттерны/01. Функции высшего порядка и композиция|композиция функций]].

### Promise с доступными resolve и reject

Верни `{ promise, resolve, reject }`, чтобы тест мог вручную завершить операцию. Это учебный аналог основной идеи `Promise.withResolvers()`.

> [!example]- Разбор управляемого Promise
>
> Executor в `new Promise` вызывается синхронно, поэтому функции завершения доступны сразу после конструктора.
>
> ```js
> // checked-example: with-resolvers
> function withResolvers() {
>   let resolve;
>   let reject;
>   const promise = new Promise((yes, no) => {
>     resolve = yes;
>     reject = no;
>   });
>   return { promise, resolve, reject };
> }
> ```
>
> Создай `const job = withResolvers()`, подпишись на `job.promise`, затем вызови `job.resolve(42)`. После первого завершения повторные `resolve`/`reject` не меняют результат. Это удобнее случайных таймеров в проверке гонок запросов.
