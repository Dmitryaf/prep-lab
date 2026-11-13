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

> [!example]- Разбор
>
> Сначала разделю две задачи: проверить роль пользователя и показать нужную ветку шаблона. Директива, подключённая через hostDirectives, должна быть standalone. Её inputs и outputs нужно открыть явно, если они должны стать частью внешнего API.
>
> В исходном структурном использовании директива находится на ng-template и получает TemplateRef и ViewContainerRef. Если перенести её на обычный div, обязательного TemplateRef там уже не будет.
>
> В версии Angular с NgIf можно поручить ему создание и удаление веток. Для этого standalone UserHasRoleDirective подключает hostDirectives:[NgIf] и получает NgIf через DI. Setter роли присваивает ngIf.ngIf = userService.hasRole(role), а setter appUserHasRoleElse передаёт шаблон в ngIf.ngIfElse.
>
> Внешние имена входов остаются прежними. UserService тоже приходит через DI, например с providedIn:'root'. Обёртка отвечает за проверку роли, а NgIf — за представление. При переходе на другую версию Angular нужно проверить доступность и статус NgIf; если обёртка больше не нужна, условие можно выразить через @if в шаблоне.
>
> Проверки: разрешённая/запрещённая роль, смена роли, замена else-шаблона и уничтожение владельца. API проверяет право на действие независимо от видимости ссылки. [Контракт hostDirectives](https://angular.dev/guide/directives/directive-composition-api).

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

> [!example]- Разбор
>
> В дочернем шаблоне задаю два места: ng-content select="[form-label]" для подписи и ng-content select="[form-action]" для действий. Родитель передаёт элементы с этими маркерами внутрь user-data-form. Для подсчёта использую маркерную директиву FormAction и @ContentChildren(FormAction, {descendants:true}); QueryList.length доступен после content init, изменения отслеживаются через changes. ViewChildren искал бы собственный шаблон, а не переданное содержимое.
>
> Считаю только элементы по согласованному контракту: наличие маркера не обязательно означает видимую и активную кнопку. У действий задаю type="button", если они не должны отправлять форму, или явный submit-контракт. Если кнопки должны быть частью формы, слот действий располагаю внутри form. Проверки: ноль/несколько кнопок, условное добавление и удаление, отдельная подпись и клавиатурное управление. Для динамического числа не сохраняю единственный снимок QueryList.length навсегда.

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

> [!example]- Разбор
>
> Здесь три проблемы: в конструкторе ещё нет значения @Input, new UserService обходит DI, а шаблон обращается к user.name до загрузки пользователя. Сервис получаю через constructor injection или inject.
>
> На изменения userId реагирую через поток или ngOnChanges. Одного ngOnInit недостаточно: компонент может остаться на экране, но получить другой id.
>
> Поток id пропускаю через distinctUntilChanged и switchMap на getUser$. Ошибку обрабатываю внутри запроса, чтобы следующий id всё ещё мог запустить загрузку. У результата отдельно показываю загрузку, ошибку, отсутствие пользователя и найденные данные.
>
> В шаблоне читаю поток через async pipe и обращаюсь к имени только после получения пользователя. Ручную подписку снимаю при уничтожении компонента. Если источник нельзя отменить, дополнительно запрещаю старому результату менять актуальные данные.
>
> Проверки: первый вход, смена A→B с ответами B→A, ошибка и последующая успешная смена id, отсутствие запроса для недопустимого id, уничтожение компонента. Исправление только через user?.name скроет ранний сбой шаблона, но не исправит неправильный запрос.

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
>
> В исходном основном компоненте есть отдельные ошибки: username ещё не установлен в конструкторе, ручной new обходит DI, два async pipe подписываются на холодный запрос через разные ветви. Получаю сервис через DI, запускаю запрос по изменениям username и связываю один результат с состояниями loading/error/empty/data. В шаблоне делаю одну подписку и использую полученный список и его length; если потребителей несколько, разделяю выполнение явно.
>
> Проверяю число HTTP-запросов, смену username, поздний ответ, пустой список и ошибку. Скрытый ul может оставить вторую подписку и повторный HTTP-запрос. Следующие варианты DI проверяются отдельно от исправления загрузки.

**Вариант DI:** сервис может отсутствовать. Ограничьте поиск границей хоста и выдайте понятную ошибку, сохранив возможность компиляции. Объясните Optional, Self, SkipSelf, Host и Inject; какие модификаторы совместимы? Что изменится без Optional?

> [!example]- Разбор после самостоятельной попытки
>
> ```ts
> constructor(
>   @Optional()
>   @Host()
>   @Inject(RepositoryInfoService) // необязательно
>   private readonly repositoryInfoService: RepositoryInfoService | null) {
>   if (!repositoryInfoService) {
>     throw new Error(`Для работы компонента необходимо предоставить сервис, реализующий интерфейс RepositoryInfoService`);
>   }}
> ```
>
> Host ограничивает поиск границей хоста, а не только непосредственным родителем. Self разрешает поиск только в текущем injector, SkipSelf начинает с родительского. Optional возвращает null при отсутствии provider; без него Angular выдаёт ошибку до входа в тело конструктора. Inject задаёт токен поиска. Self не сочетают с Host или SkipSelf; Optional можно сочетать с каждым допустимым ограничением.
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
> В варианте с NgModule компонент должен быть не-standalone (`standalone: false` в версиях, где автономность включена по умолчанию); автономный компонент подключают через imports.
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
>
> Проверяю это двумя экземплярами компонента: provider компонента создаёт отдельный экземпляр сервиса для каждого поддерева, а директива внутри него без собственных providers находит ближайший доступный. Маркер id в конструкторе сервиса позволяет сравнить фактическую идентичность, а не угадывать её по месту файла.
>
> providers и viewProviders отличаются тем, кому доступен сервис: viewProviders ограничивает его видимость для содержимого, переданного через проекцию. Поэтому в проверке важно разместить директиву и во view компонента, и в projected content.
>
> Модификаторы тоже меняют поиск. Self ищет в текущем injector, SkipSelf начинает с родительского, Host ограничивает поиск границей host. Optional возвращает null, если подходящий provider не найден; без него Angular сообщает об ошибке.
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

> [!example]- Разбор
>
> Страну, улицу и дом проверяю валидаторами отдельных полей. Условие «заполнен город или населённый пункт» проверяю на уровне FormGroup: оно зависит сразу от двух значений. Групповой ValidatorFn нормализует строки по принятому правилу и возвращает null либо {locationRequired:true}.
>
> Эту ошибку храню у группы. Если безусловно вызвать setErrors(null) у поля, можно случайно стереть его собственную ошибку.
>
> Использую типизированные nonNullable-контролы для строк, если null не является допустимым значением. Перед отправкой markAllAsTouched, затем проверяю invalid и pending; отправка не должна обходить ещё выполняющийся async validator. Сервер повторно проверяет данные независимо от клиентского статуса.
>
> Проверки: оба поля пусты, только город, только населённый пункт, оба заполнены, пробелы и очистка ранее допустимого значения. Async validator нужен для серверной проверки, а не для локального правила двух строк. [Групповые валидаторы Angular](https://angular.dev/guide/forms/form-validation#cross-field-validation).

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

> [!example]- Разбор
>
> Значение контрола — массив выбранных индексов; внутри компонента для переключения удобно использовать Set. Когда форма вызывает writeValue, обновляю отображение и не вызываю onChange обратно. Иначе внешняя запись начнёт выглядеть как пользовательский ввод.
>
> registerOnChange и registerOnTouched сохраняют переданные функции. При выборе картинки создаю новый массив и вызываю onChange; завершённое взаимодействие отмечаю через onTouched. setDisabledState запрещает изменение и обновляет доступное состояние элемента.
>
> Для подключения к форме регистрирую NG_VALUE_ACCESSOR с multi:true и useExisting, указывающим на текущий компонент.
>
> В шаблоне использую кнопки type="button" с aria-pressed и понятными подписями вместо недоступного клика по div. Повторный выбор удаляет индекс. Валидатор сравнивает множества с допустимым набором: порядок не важен, посторонние индексы и дубликаты не должны проходить. Перед отправкой родитель проверяет форму, а сервер проверяет настоящий challenge.
>
> Проверяю внешние writeValue и reset, выбор и снятие картинки, disabled и touched, работу через ngModel и formControl. При writeValue не должно быть обратного вызова onChange.
>
> Если correctImagesIndexes передан в браузер, пользователь может прочитать правильный ответ. Поэтому настоящую капчу проверяет сервер. [ControlValueAccessor](https://angular.dev/api/forms/ControlValueAccessor).

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

> [!example]- Разбор
>
> При map(this.filter) передаётся функция без объекта-получателя. В её вызове this не является AppService, поэтому чтение this.currentFilter ломается. Минимальное исправление: map(users => this.filter(users)); другой вариант — заранее привязанный метод или стрелочное поле класса.
>
> Это исправляет контекст вызова, но не делает currentFilter реактивным: смена поля сама по себе не вызывает новое значение users. Если фильтр должен обновлять результат немедленно, представляю его отдельным потоком и объединяю с users через combineLatest либо явно пересчитываю состояние.
>
> Проверки: исходный active, deleted при следующем emission, смена фильтра без нового users и две подписки.

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

> [!example]- Разбор
>
> Сервис помечаю @Injectable, а не @Inject: последний задаёт токен параметра. Базовый URL передаю через конфигурационный DI-токен. Ключ кэша включает id, параметры ответа и контекст пользователя/организации; URL кодирует входные значения. Баланс и команды записи не включаю в общий кэш только потому, что они используют HTTP.
>
> Для одного ключа сохраняю общий Observable с shareReplay({bufferSize:1,refCount:true}), чтобы потребители разделяли запрос. При ошибке удаляю запись и передаю ошибку подписчику; при смене пользователя очищаю его кэш.
>
> Далее отдельно задаю, сколько живёт успешный результат и какие события его сбрасывают. refCount по-разному влияет на завершившийся и ещё работающий источник, поэтому проверяю поведение установленной версии RxJS. Само наличие share ещё не задаёт правила постоянного кэша.
>
> Для POST кэширование допустимо только при явно известной семантике чтения; ключ тогда включает нормализованное тело и контекст, а не только URL. Проверки: два одновременных потребителя, повтор после ошибки, разные параметры, logout, отмена всех подписчиков и запрос некэшируемого баланса. HTTP-перехватчик удобен для общих правил, но не должен угадывать бизнес-свежесть.

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

> [!note]- Подсказка
> computed и effect; equal, untracked и onCleanup; где применяются эти средства и как они влияют на повторное вычисление?

**Вариант:** добавьте в допустимом контексте внедрения зависимостей следующий код и объясните результат преобразования в Observable.

```ts
const c$ = toObservable(this.theme);
c$.subscribe((item) => console.log('theme: ', item));
this.light.set('grey');
this.light.set('silver');
this.light.set('white');
```

Как сигнал читает текущее состояние, а Observable доставляет события? Когда выбирать каждый подход? Как изменение сигнала обновляет представление и какие промежуточные изменения не попадут в поток?

> [!example]- Разбор
>
> Последовательность в конструкторе: compute: black; theme: black; theme: black; compute: grey; theme: grey; theme: grey; compute: blue; theme: blue; compute: silver; theme: silver. Первое чтение вычисляет значение, второе берёт кэш. dark.set инвалидирует текущую зависимость; light.set('blue') пока не влияет, потому что ветка light ещё не читалась. После isDarkMode=false вычисление читает light и меняет набор зависимостей.
>
> Дальнейшее чтение theme из шаблона не обязано снова вычислять его без изменения зависимости. Для toObservable нужно учитывать стабилизацию сигнала: последовательные синхронные set могут дать одно последнее значение, это не журнал каждой записи. Первый доступный emission может быть синхронным, дальнейшие обновления доставляются через механизм effect. Проверка — отдельно записать синхронные чтения и подписку, не смешивая их очередность. [Signals](https://angular.dev/guide/signals), [toObservable](https://angular.dev/ecosystem/rxjs-interop#timing-of-toobservable).

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

> [!example]- Разбор
>
> Шаблон уже прочитал initializing..., затем ngAfterViewInit синхронно меняет то же связанное значение. Дополнительная проверка dev-режима замечает нестабильность результата внутри этого прохода. OnPush не отменяет требование согласованного состояния.
>
> В данном примере значение не зависит от DOM, поэтому задаю его до проверки шаблона, например в ngOnInit или при инициализации поля с подходящим смыслом. Если нужен настоящий результат измерения представления, проектирую отдельный этап после рендера и проверяю поведение этой операции, а не просто добавляю setTimeout ко всем ошибкам. Принудительный detectChanges может скрывать обратный поток изменения вместо устранения причины.
>
> Проверяю первый render, повторное создание и обновление входов в dev-режиме. Дополнительная dev-проверка в production отключена, поэтому несогласованное состояние может остаться на экране без исключения. [Angular NG0100](https://angular.dev/errors/NG0100).

### Поисковые подсказки: отмена и обработка ошибок

Реализуйте загрузку подсказок при изменении searchTerm$. findByTerm выполняет GET-запрос и возвращает массив строк. searchPrompts$ принимает null для индикатора загрузки, пустой массив для сообщения «Нет подсказок» и массив для результата.

```ts
declare const searchTerm$: Observable<string>;
declare function findByTerm(term: string): Observable<string[]>;
declare const searchPrompts$: Subject<string[] | null>;
```

По порядку добавьте обработку ошибки, паузу 500 мс после последнего ввода, минимальную длину три символа и отмену устаревшего запроса. Что показывать, если новый ввод короче трёх символов?

Отдельные варианты: повтор при ошибке; параллельные источники; первый успешный ответ; резервный источник при отказе предыдущего; предел трёх одновременных запросов. Объясните выбор оператора высшего порядка, виды Subject и отличие Observable от Promise.

> [!example]- Разбор
>
> Сначала нормализую строку и исключаю одинаковые значения. Внешний switchMap реагирует на каждый новый ввод немедленно: для короткой строки возвращает of([]), для остальных создаёт timer(500), после которого запускает findByTerm. Так смена текста отменяет и таймер, и уже активный внутренний запрос; один debounceTime перед switchMap оставлял бы старый запрос активным до окончания паузы.
>
> Перед запуском запроса выдаю null для loading, ошибку ловлю внутри запроса и превращаю в согласованное состояние. Исходный Subject различает только loading/пусто/данные: для отдельной ошибки нужен дополнительный канал или расширенный union, нельзя молча назвать отказ «ничего не найдено». Подписку освобождаю при уничтожении владельца.
>
> Проверяю быстрый ввод A → B с поздним ответом A, сокращение строки до двух символов во время запроса, отказ с последующим вводом и уход со страницы. retry ограничиваю числом попыток и применяю к одному чтению.
>
> Если нужны несколько источников, учитываю правило race: он выбирает первый исход, в том числе ошибку. Для «первого успеха» придётся отдельно обработать отказы и ситуацию, когда не ответил успешно ни один источник. Если же нужен запасной запрос после отказа основного, использую catchError.
