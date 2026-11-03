---
title: "Angular: дополнительная практика"
priority: P2
updated: 2026-10-06
---

# Angular: дополнительная практика

[[Собеседования/00. Карта раздела|Карта банка]]

Решайте до просмотра разбора. Исходные ошибки в коде сохранены намеренно. Если в условии не указаны среда выполнения и режим или поведение пустого входа, сначала сформулируйте нужное уточнение.

> [!abstract]- Вопросы и задачи на этой странице
>
> - [[Собеседования/Практика/Angular#Компоненты, DI и шаблоны|Компоненты, DI и шаблоны]]
> - [[Собеседования/Практика/Angular#Автономная директива и подключение других директив|Автономная директива и подключение других директив]]
> - [[Собеседования/Практика/Angular#Проекция кнопок и подписи через ng-content|Проекция кнопок и подписи через ng-content]]
> - [[Собеседования/Практика/Angular#Проверка компонента: загрузка пользователя и DI|Проверка компонента: загрузка пользователя и DI]]
> - [[Собеседования/Практика/Angular#Проверка компонента: подписки, шаблон и DI|Проверка компонента: подписки, шаблон и DI]]
> - [[Собеседования/Практика/Angular#Иерархия зависимостей: модуль, компонент и директива|Иерархия зависимостей: модуль, компонент и директива]]
> - [[Собеседования/Практика/Angular#Формы и проверка данных|Формы и проверка данных]]
> - [[Собеседования/Практика/Angular#Валидация зависимых полей адреса|Валидация зависимых полей адреса]]
> - [[Собеседования/Практика/Angular#Капча: ControlValueAccessor и проверка выбора|Капча: ControlValueAccessor и проверка выбора]]
> - [[Собеседования/Практика/Angular#Реактивность, запросы и жизненный цикл|Реактивность, запросы и жизненный цикл]]
> - [[Собеседования/Практика/Angular#Потеря this в обработчике RxJS|Потеря this в обработчике RxJS]]
> - [[Собеседования/Практика/Angular#Кэширующие сервисы для работы с бэкендом|Кэширующие сервисы для работы с бэкендом]]
> - [[Собеседования/Практика/Angular#Ленивое вычисление computed и динамические зависимости|Ленивое вычисление computed и динамические зависимости]]
> - [[Собеседования/Практика/Angular#ExpressionChangedAfterItHasBeenCheckedError|ExpressionChangedAfterItHasBeenCheckedError]]
> - [[Собеседования/Практика/Angular#Поисковые подсказки: отмена и обработка ошибок|Поисковые подсказки: отмена и обработка ошибок]]
>

## Компоненты, DI и шаблоны

### Автономная директива и подключение других директив

Перепишите директиву как автономную с использованием hostDirectives.

```ts
@Injectable()
export class UserService {
  constructor() {}
  hasRole(role: string): boolean {
    return role === 'Admin';
  }
}

@Directive({
  selector: '[appUserHasRole]',
})
export class UserHasRoleDirective {
  private userRole: string;
  private elseTempalte: TemplateRef<any> = null;
  private thenViewRef: EmbeddedViewRef<any> = null;
  private elseViewRef: EmbeddedViewRef<any> = null;
  @Input()
  set appUserHasRole(role: string) {
    this.userRole = role;
    this.thenViewRef = null;
    this.updateView();
  }
  @Input()
  set appUserHasRoleElse(tempalte: TemplateRef<any>) {
    this.elseTempalte = tempalte;
    this.elseViewRef = null;
    this.updateView();
  }
  constructor(
    private readonly userService: UserService,
    private readonly templateRef: TemplateRef<any>,
    private readonly viewRef: ViewContainerRef,
  ) {}
  private get isHasRole() {
    return this.userService.hasRole(this.userRole);
  }
  updateView() {
    if (this.isHasRole) {
      if (!this.thenViewRef) {
        this.viewRef.clear();
        this.elseViewRef = null;
        this.thenViewRef = this.viewRef.createEmbeddedView(this.templateRef);
      }
    } else {
      if (!this.elseViewRef) {
        this.viewRef.clear();
        this.thenViewRef = null;
        if (this.elseTempalte) {
          this.elseViewRef = this.viewRef.createEmbeddedView(this.elseTempalte);
        }
      }
    }
  }
}
```

```html
<a
  *appUserHasRole="'Admin'; else elseTemplate"
  target="_blank"
  href="https://angular.io/start"
>
  Learn more about Angular</a
>
```

### Проекция кнопок и подписи через ng-content

Передайте в компонент user-data-form кнопки действий, затем получите их внутри компонента и покажите число доступных действий. Отдельно передайте подпись формы, расположенную в другой области шаблона.

```html
<!-- код дочернего компонента user-data-form -->
<form>
  <input name="phone" [ngModel]="phone" />
  <input name="address" [ngModel]="address" />
</form>
<!-- код родительского компонента --><user-data-form
></user-data-form>
```

### Проверка компонента: загрузка пользователя и DI

Найдите ошибки загрузки пользователя, получения входного свойства и создания сервиса. Предложите исправления.

```ts
@Component({
  selector: 'user',
  template: ` <div>Hello, {{ user.name }}</div> `,
})
export class UserComponent {
  @Input() userId: string;
  public user: UserInterface;
  constructor() {
    const userService = new UserService();
    userService.getUser$(this.userId).subscribe((user) => (this.user = user));
  }
}
```

### Проверка компонента: подписки, шаблон и DI

Проверьте получение username, создание сервиса и число подписок на запрос. Предложите исправления.

```ts
@Component({
  selector: 'repository-list',
  template: `
    <h1>Репозитории пользователя {{ username }}</h1>
    <ul>
      <li *ngFor="let repository of repositories$ | async">
        {{ repository.name }}
      </li>
    </ul>
    <div *ngIf="!(haveRepositories$ | async)">Нет репозиториев</div>
  `,
})
export class RepositoryListComponent {
  @Input()
  username: string;
  public repositories$: Observable<RepositoryInfo[]>;
  public haveRepositories$: Observable<boolean>;
  constructor() {
    const repositoryInfoService = new RepositoryInfoService();
    this.repositories$ = repositoryInfoService.getRepositoryListForUser(this.username);
    this.haveRepositories$ = this.repositories$.pipe(
      map((repositories) => repositories?.length > 0),
    );
  }
} // Пример использования компонента:
// <repository-list username="v.pupkin"></repository-list>
```

**Вариант шаблона:** сравните поведение пустого списка. Как передать контекст в ng-template? Какие виды директив есть в Angular и как расширить существующую директиву?

```
@Component({
  selector: 'repository-list',
  template: `
  <!-- Тут был код... -->
  <div *ngIf="!(haveRepositories$ | async)">
    Нет репозиториев
  </div>
   <!-- В чём разница с предыдущим вариантом? -->
  <ng-container *ngIf="haveRepositories$ | async; else emptyRepositories">
    <ul>
      <li *ngFor="let repository of repositories$ | async">
         {{ repository.name }}
      </li>
    </ul>
  </ng-container>
   <ng-template #emptyRepositories>
    <div>Нет репозиториев</div>
  </ng-template>
  `,})
```

> [!example]- Разбор после самостоятельной попытки
>
> В варианте с ng-container пустой список ul не создаётся. ng-container не добавляет собственный элемент в DOM; ng-template задаёт шаблон для последующего создания представления. Контекст передаётся через ngTemplateOutletContext и читается через let-переменные.
>

**Вариант DI:** сервис может отсутствовать. Ограничьте поиск границей хоста и выдайте понятную ошибку, сохранив возможность компиляции. Объясните Optional, Self, SkipSelf, Host и Inject; какие модификаторы совместимы? Что изменится без Optional?

> [!example]- Разбор после самостоятельной попытки
>
> ```ts
> constructor(
>   @Optional()
>   @Host()
>   @Inject(RepositoryInfoService) // необязательно
>   private readonly repositoryInfoService: RepositoryInfoService) {
>   if (!repositoryInfoService) {
>     throw new Error(`Для работы компонента необходимо предоставить сервис, реализующий интерфейс RepositoryInfoService`);
>   }}
> ```
>
> Host ограничивает поиск границей хоста, а не только непосредственным родителем.
>

**Подмена сервиса:** предоставьте NewCommonRepositoryInfoService по токену RepositoryInfoService, сохранив конструктор компонента. Сравните поставщика на уровне компонента и модуля; providers и viewProviders; useClass, useValue, useExisting, useFactory и multi: true. Для чего нужен forwardRef?

> [!example]- Разбор после самостоятельной попытки
>
> ```
> @Component({
>   providers: [
>     {
>       provide: RepositoryInfoService,
>       useClass: NewCommonRepositoryInfoService
>     }
>   ]})
> ```
>
> ```
> @NgModule({
>   declarations: [RepositoryListComponent],
>   exports: [RepositoryListComponent],
>    providers: [
>     {
>       provide: RepositoryInfoService,
>       useClass: NewCommonRepositoryInfoService
>     }
>   ], })
> ```
>
> forwardRef откладывает разрешение ссылки на ещё не объявленный токен. Это не ожидание создания экземпляра сервиса. [Назначение forwardRef](https://angular.dev/api/core/forwardRef).
>

### Иерархия зависимостей: модуль, компонент и директива

Сервис объявлен в `providers` модуля и компонента. Его получают компонент и директива в шаблоне этого компонента. Какие экземпляры они получат и почему? Перед ответом уточните собственные поставщики директивы и модификаторы поиска.

Усложнения рассматривайте отдельно: `viewProviders`, директива в переданном содержимом и `Host`. Код этих вариантов не предоставлен; предложите минимальный пример для проверки.

> [!example]- Разбор после самостоятельной попытки
>
> В базовом случае, если директива не переопределяет сервис и не меняет правила поиска, компонент и директива используют экземпляр из поставщика компонента. Перенос директивы в переданное содержимое и изменение модификаторов могут изменить результат.
>

## Формы и проверка данных

### Валидация зависимых полей адреса

Добавьте проверку реактивной формы: страна, улица и дом обязательны; хотя бы одно из полей «город» и «населённый пункт» заполнено. Перед отправкой проверьте всю форму на сервере.

Сравните подходы к формам в Angular, групповые и асинхронные валидаторы, типизированные формы.

```ts
@Component({
  selector: 'address-form',
  template: ` <div [formGroup]="formGroup">...</div> `,
})
export class AddressFormComponent {
  formGroup = new FormGroup({
    country: new FormControl(null),
    city: new FormControl(null),
    locality: new FormControl(null),
    street: new FormControl(null),
    house: new FormControl(null),
    room: new FormControl(null),
  });
}
```

### Капча: ControlValueAccessor и проверка выбора

Нажатие выбирает изображение, повторное снимает выбор; можно выбрать от нуля до всех изображений. При отправке допустимый набор уходит на сервер, иначе показывается ошибка.

Компонент должен реализовать ControlValueAccessor для ngModel и formControl. Заранее настроенный валидатор проверяет набор. Согласуйте роли registerOnChange, writeValue и остальных методов интерфейса.

```ts
// captcha.component.ts - компонент капчи
@Component({
  selector: 'captcha',
  template: `
    <!-- Картинки рендерим в этот div, выбранная картинка имеет css class shaded-image -->
    <div id="captcha-container"></div>
  `,
  styles: [
    `
      .shaded-image {
        opacity: 0.5;
      }
    `,
  ],
})
export class CaptchaComponent {
  @Input()
  public imageUrls: string[];
  // Ваш код
}
// form.component.ts - родительский компонент формы
@Component({
  template: `
    <form>
      <captcha [imageUrls]="imageUrls"></captcha>
      <button>Submit</button>
    </form>
  `,
})
export class FormComponent {
  public readonly imageUrls: string[] = [
    'img1.jpg',
    'img2.jpg',
    'img3.jpg',
    'img4.jpg',
    'img5.jpg',
    'img6.jpg',
    'img7.jpg',
    'img8.jpg',
    'img9.jpg',
  ];
  private readonly correctImagesIndexes: number[] = [1, 7, 8];
  // пишем свой код здесь
}
```

## Реактивность, запросы и жизненный цикл

### Потеря this в обработчике RxJS

Метод сервиса передаётся в map без привязки this. Найдите причину сбоя и предложите исправление.

```ts
const USERS_TOKEN = 'user';
export interface User {
  name: string;
  status: 'active' | 'deleted';
}

// Настройка providers компонента, который подключает сервис:
const providers = [
  {
    provide: USERS_TOKEN,
    useValue: of([
      { name: 'Alex', status: 'active' },
      { name: 'Nick', status: 'deleted' },
    ]),
  },
];

@Injectable()
export class AppService {
  private currentFilter: User['status'] = 'active';
  constructor(@Inject(USERS_TOKEN) private readonly users: Observable<User[]>) {}
  getFilteredUsers(): Observable<User[]> {
    return this.users.pipe(map(this.filter));
  }
  private filter(users: User[]): User[] {
    return users.filter((user) => user.status === this.currentFilter);
  }
}
```

### Кэширующие сервисы для работы с бэкендом

Реализуйте кэш успешных ответов getUser(id); ошибку не кэшируйте, чтобы запрос можно было повторить. Данные пользователя могут не меняться в течение сессии.

```ts
@Inject()
export class UserService {
  constructor(private httpClient: HttpClient) {}
  getUser(id: string): Observable<User> {
    return this.httpClient.get<User>('http://tinkoff.ru/prod-api/getUser/' + id);
  }
}
```

Последовательно рассмотрите варианты:

1. Добавляются параметры запроса: как меняется ключ кэша и использование options?
2. Несколько сервисов используют общий механизм; баланс счёта каждый раз запрашивается заново.
3. Адрес API зависит от среды разработки или рабочего окружения. Передайте конфигурацию централизованно, без копирования условия в каждый сервис.
4. Некоторые данные приходят через POST: как определить допустимость и ключ кэширования?

Сравните собственную обёртку, управление состоянием и HTTP-перехватчик. Уточните время жизни кэша и одновременные запросы одного ключа.

### Ленивое вычисление computed и динамические зависимости

Определите сообщения в консоли компонента переключения темы. Объясните ленивое вычисление, кэш и динамические зависимости computed.

```ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
@Component({
  selector: 'theme',
  template: ` <div>theme: {{ theme() }}</div> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeComponent {
  private readonly isDarkMode = signal(true);
  private readonly dark = signal('black');
  private readonly light = signal('white');
  public readonly theme = computed(() => {
    const value = this.isDarkMode() ? this.dark() : this.light();
    console.log(`compute: ${value}`);
    return value;
  });
  constructor() {
    console.log(`theme: ${this.theme()}`);
    console.log(`theme: ${this.theme()}`);
    this.dark.set('grey');
    console.log(`theme: ${this.theme()}`);
    this.light.set('blue');
    console.log(`theme: ${this.theme()}`);
    this.isDarkMode.set(false);
    console.log(`theme: ${this.theme()}`);
    this.light.set('silver');
    console.log(`theme: ${this.theme()}`);
  }
}
```

Уточнения: computed и effect; equal, untracked и onCleanup; где применяются эти средства и как они влияют на повторное вычисление?

**Вариант:** добавьте в допустимом контексте внедрения зависимостей следующий код и объясните результат преобразования в Observable.

```ts
const c$ = toObservable(this.theme);
c$.subscribe((item) => console.log('theme: ', item));
this.light.set('grey');
this.light.set('silver');
this.light.set('white');
```

Как сигнал читает текущее состояние, а Observable доставляет события? Когда выбирать каждый подход? Как изменение сигнала обновляет представление и какие промежуточные изменения не попадут в поток?

### ExpressionChangedAfterItHasBeenCheckedError

Объясните ошибку изменения проверенного значения в режиме разработки. Предложите исправление и покажите, почему оно устраняет причину.

```ts
@Component({
  selector: 'view-status',
  template: `<div>Current view status: {{ viewStatus }}</div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewStatusComponent implements AfterViewInit {
  protected viewStatus: string = 'initializing...';
  ngAfterViewInit() {
    this.setViewInitializedStatus();
  }
  private setViewInitializedStatus() {
    this.viewStatus = 'initialization done! :)';
  }
}
```

### Поисковые подсказки: отмена и обработка ошибок

Реализуйте загрузку подсказок при изменении searchTerm$. findByTerm выполняет GET-запрос и возвращает массив строк. searchPrompts$ принимает null для индикатора загрузки, пустой массив для сообщения «Нет подсказок» и массив для результата.

```ts
declare const searchTerm$: Observable<string>;
declare function findByTerm(term: string): Observable<string[]>;
declare const searchPrompts$: Subject<string[] | null>;
```

По порядку добавьте обработку ошибки, паузу 500 мс после последнего ввода, минимальную длину три символа и отмену устаревшего запроса. Что показывать, если новый ввод короче трёх символов?

Отдельные варианты: повтор при ошибке; параллельные источники; первый успешный ответ; резервный источник при отказе предыдущего; предел трёх одновременных запросов. Объясните выбор оператора высшего порядка, виды Subject и отличие Observable от Promise.
