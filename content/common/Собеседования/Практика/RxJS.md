---
title: "RxJS: практические задачи"
priority: P2
updated: 2026-10-06
---

# RxJS: практические задачи

[[Собеседования/00. Карта раздела|Карта банка]]

Решайте до просмотра разбора. Исходные ошибки в коде сохранены намеренно. Если в условии не указаны среда выполнения и режим или поведение пустого входа, сначала сформулируйте нужное уточнение.

> [!abstract]- Вопросы и задачи на этой странице
>
> - [[Собеседования/Практика/RxJS#Запросы, порядок и ошибки|Запросы, порядок и ошибки]]
> - [[Собеседования/Практика/RxJS#Кодирование: порядок, ошибки и предел параллелизма|Кодирование: порядок, ошибки и предел параллелизма]]
> - [[Собеседования/Практика/RxJS#Поиск, фильтрация и сброс страницы|Поиск, фильтрация и сброс страницы]]
> - [[Собеседования/Практика/RxJS#API-запросы через Observable и Promise|API-запросы через Observable и Promise]]
> - [[Собеседования/Практика/RxJS#Выбор switchMap, mergeMap, concatMap и exhaustMap|Выбор switchMap, mergeMap, concatMap и exhaustMap]]
> - [[Собеседования/Практика/RxJS#Показ сообщения об ошибке|Показ сообщения об ошибке]]
> - [[Собеседования/Практика/RxJS#Подписки и синхронные источники|Подписки и синхронные источники]]
> - [[Собеседования/Практика/RxJS#Превратить браузерное API в Observable|Превратить браузерное API в Observable]]
> - [[Собеседования/Практика/RxJS#DI-токен потока видимости страницы|DI-токен потока видимости страницы]]
> - [[Собеседования/Практика/RxJS#Параллельные подписки|Параллельные подписки]]
> - [[Собеседования/Практика/RxJS#Два синхронных потока: пары всех значений|Два синхронных потока: пары всех значений]]
>

## Запросы, порядок и ошибки

### Кодирование: порядок, ошибки и предел параллелизма

Даны компонент EncodingComponent и сервис EncodingService с готовой логикой кодирования строк. Необходимо реализовать функциональность кодирования данных в компоненте.
```ts
class EncodingService {
  encode(data: string): Observable<string> {
    // уже существующая реализация
    // кодирует строку
  }
}

type IncomingData = string;
type EncodedData = string;
class EncodingComponent {
  constructor(private readonly encodingService: EncodingService) {}
  encode(data$: Observable<IncomingData>): Observable<EncodedData> {
    // твоя реализация
  }
}
```
Изменяем у метода типы входных данных и результата.
Теперь вместо потока метод принимает массив.
```ts
type IncomingData = { id: string; data: string };
type EncodedData = IncomingData & { res: string };
class EncodingComponent {
  constructor(private readonly encodingService: EncodingService) {}
  encode(data: readonly IncomingData[]): Observable<EncodedData[]> {
    // твоя реализация
  }
}
```
Тот же метод, но в случае ошибки вместо закодированной строки возвращает null.
Плюс дополнительные требования описаны в комментарии.
Ошибка отдельного кодирования не должна прерывать обработку остальных элементов.
```ts
type IncomingData = { id: string; data: string };
type EncodedData = IncomingData & { res: string | null };
class EncodingComponent {
  constructor(private readonly encodingService: EncodingService) {}
  encode(data: readonly IncomingData[]): Observable<EncodedData[]> {
    // твоя реализация
    // сохраняет порядок данных в массиве результата
    // обрабатывает ошибки при кодировании
    // для оптимизации производительности кодирует не больше 3 строк одновременно
  }
}
```

### Поиск, фильтрация и сброс страницы

Есть страница, на которой отображен список компаний, есть возможность поиска компании по названию, фильтрации по типу,
а также переключения страниц. Необходимо реализовать логику работы данной страницы. Примем, что дочерние компоненты уже реализованы.
При написании логики необходимо учесть, что при поиске и фильтрации должна сбрасываться страница.
```ts
// company-list.component.ts - компонент списка компаний
@Component({
  selector: 'company-list',
  template: ` <search-panel (search)="onSearch($event)"></search-panel>
    <filter-panel (search)="onFilter($event)"></filter-panel>
    <companies [companies]="companies$ | async"></companies>
    <pagination-panel (pageChange)="onPageChange($event)"></pagination-panel>`,
})
export class CompanyListComponent {
  companies$ = new BehaviorSubject<Company[]>([]);
  // ваш код здесь
  onSearch(companyName: string) {
    // ваш код здесь
  }
  onFilter(companyType: string) {
    // ваш код здесь
  }
  onPageChange(page: number) {
    // ваш код здесь
  }
  getCompanies(
    companyName: string,
    companyType: string,
    page: number,
  ): Observable<Company[]> {
    // метод уже реализован
  }
}
```

### API-запросы через Observable и Promise

Задача в несколько шагов.
Даны HTTP-запросы, обёрнутые в Observable и Promise.
1. Сколько уйдёт запросов?
```ts
const obs$ = httpClient.get('https://tinkoff.ru'); // Стандартный HttpClient из Angular
const promise = fetch('https://tinkoff.ru');
```

2. Сколько запросов уйдёт в таком случае?
```ts
const obs$ = httpClient.get('https://tinkoff.ru'); // Стандартный HttpClient из Angular
const promise = fetch('https://tinkoff.ru');
obs$.subscribe(console.log);
obs$.subscribe(console.log);
obs$.subscribe(console.log);
promise.then(console.log);
promise.then(console.log);
promise.then(console.log);
```

3. Сколько раз выведется сообщение в консоль в каждом из случаев?
4. Что можно сделать, чтобы с Observable запрос уходил один раз?
5. Что произойдёт при share() и повторной подписке через 15 секунд?
```ts
const obs$ = httpClient.get('https://tinkoff.ru').pipe(share()); // Стандартный HttpClient из Angular, использован оператор share()
const promise = fetch('https://tinkoff.ru');
obs$.subscribe(console.log);
obs$.subscribe(console.log);
obs$.subscribe(console.log);
setTimeout(() => {
  obs$.subscribe(console.log);
}, 15000);
promise.then(console.log);
promise.then(console.log);
promise.then(console.log);
```

Уточните время завершения первого запроса относительно повторной подписки через 15 секунд. share не равен постоянному кэшу ответа.

### Выбор switchMap, mergeMap, concatMap и exhaustMap

Предоставлены `userId$: Observable<string>` и `userService.getUser(id): Observable<User>`. Реализовывать HTTP-клиент не нужно. Подберите обработку для каждого независимого варианта и объясните порядок результатов:

1. Важен только последний ID; старые результаты нужно игнорировать.
2. Нужны все пользователи, но запросы выполняются по одному.
3. Нужны все пользователи; порядок завершения не важен, запросы могут идти параллельно.
4. Одновременно разрешено не больше трёх запросов.
5. Что изменится при exhaustMap: какие ID будут проигнорированы, пока запрос активен?

Обсудите операторы высшего порядка, реальную отмену запроса и обработку ошибки внутреннего потока. Сравните Observable и Promise.

> [!example]- Разбор после самостоятельной попытки
>
> Для первого варианта подходит switchMap, для второго — concatMap, для третьего и четвёртого — mergeMap с нужным пределом. exhaustMap пропускает новые внешние значения, пока предыдущий внутренний поток не завершён. Отписка отменяет внешнюю работу только при соответствующем контракте источника.
>

### Показ сообщения об ошибке

Покажите результат запроса. При ошибке покажите уведомление на пять секунд, затем закройте его. Учитывайте самостоятельное закрытие пользователем.
```ts
/* Реализовать следующую логику
  1. Отправляем запрос на сервер
  2. Если запрос завершился ошибкой - показываем уведомление об ошибке,
            которое висит 5 секунд, затем исчезает
  3. Если запрос завершился успешно - показываем уведомление с результатом запроса*/ interface NotificationService {
  /**
   * Показывает пользователю уведомление
   * @return: поток, при подписке на поток будет показано уведомление, при завершении потока уведомление будет закрыто.
   * Также пользователь может закрыть уведомление самостоятельно, в этом случае поток завершится сам
   */
  showNotification$(text: string, type: 'error' | 'info'): Observable<void>;
}
let request$: Observable<string>; // при подписке отправит запрос на сервер
let notificationService: NotificationService; // экземпляр NotificationService
```

## Подписки и синхронные источники

### Превратить браузерное API в Observable

Родилось из практической задачи:
Есть браузерное API для MutationObserver
Выглядит оно так:

```ts
// Создаём экземпляр наблюдателя с указанной функцией колбэка
const observer = new MutationObserver(callback); // Начинаем наблюдение за настроенными изменениями целевого элемента
observer.observe(target, config);
// Позже можно остановить наблюдение
observer.disconnect();
```

По аналогии с функцией fromEvent, надо создать функцию fromMutationObserver(target, config), которая возвращает Observable, который передаёт каждое уведомление MutationObserver
Обязательно предусмотреть остановку MutationObserver, когда он уже не нужен

### DI-токен потока видимости страницы

Создайте DI-токен, по которому можно получить Observable изменений видимости страницы.
Подсказка: у document есть событие `visibilitychange`.

### Параллельные подписки

Есть поток interval(100).pipe(take(5),map(() => Math.random())). Что увидим в консоли в каждом отдельном варианте? Как получить одинаковые значения в двух подписках? Сравните общую подписку и повтор ранее полученных значений.

```js
// Вариант A:
const stream$ = interval(100).pipe(
  take(5),
  map(() => Math.random()),
);
stream$.subscribe((v) => console.log(v));
stream$.subscribe((v) => console.log(v));
```

```js
// Вариант B (отдельная программа):
const stream$ = interval(100).pipe(
  take(5),
  map(() => Math.random()),
);
stream$.subscribe((v) => console.log(v));
setTimeout(() => stream$.subscribe((v) => console.log(v)), 1000);
```

### Два синхронных потока: пары всех значений

Первый поток синхронно выдаёт два значения и завершается, второй — одно и завершается. Получите обе пары в указанном порядке. Объясните, почему обычный combineLatest при выбранном порядке подписки может потерять первое значение.

```ts
const first$ = new Observable((observer) => {
  observer.next('first_stream_first_event');
  observer.next('first_stream_second_event');
  observer.complete();
});

const second$ = new Observable((observer) => {
  observer.next('second_stream_first_event');
  observer.complete();
});
```

Ожидаемые пары:

```text
[first_stream_first_event, second_stream_first_event][
  (first_stream_second_event, second_stream_first_event)
];
```
