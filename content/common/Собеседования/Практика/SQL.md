---
title: "SQL и преобразование данных"
priority: P1
updated: 2026-10-06
---

# SQL и преобразование данных

[[Собеседования/00. Карта раздела|Карта банка]]

SQL-практика под вакансию с таким требованием. Выбери один запрос и объясни NULL, повторяющиеся ключи и пагинацию; не нужно решать весь файл для общей Vue-подготовки.

Сначала предложите решение самостоятельно. Затем откройте разбор, если он есть. Отделяйте данные условия от допущений; недостающие условия уточняйте до вывода.

> [!abstract]- Вопросы и задачи на этой странице
>
> - [[Собеседования/Практика/SQL#Выбрать SQL для клиентов с несколькими заказами в день|Выбрать SQL для клиентов с несколькими заказами в день]]
> - [[Собеседования/Практика/SQL#JOIN с повторяющимися ключами|JOIN с повторяющимися ключами]]
> - [[Собеседования/Практика/SQL#SQL: рестораны, заказы и накопительная комиссия|SQL: рестораны, заказы и накопительная комиссия]]
> - [[Собеседования/Практика/SQL#SQL: книги авторов и разбиение на страницы|SQL: книги авторов и разбиение на страницы]]
>

## Выбрать SQL для клиентов с несколькими заказами в день

Маркетологу нужен список клиентов, которые за последний месяц хотя бы раз совершили больше одного заказа в один день. Таблица orders: order_id — уникальный ID заказа; customer_id — клиент; order_date — дата заказа. Выберите запрос и объясните недостатки остальных.

```sql
-- 1
SELECT customer_id FROM orders
WHERE order_date BETWEEN current_date - INTERVAL '1 month' AND current_date
GROUP BY customer_id HAVING COUNT(order_id) > 1;
-- 2
SELECT DISTINCT customer_id FROM orders
WHERE order_date BETWEEN current_date - INTERVAL '1 month' AND current_date
  AND COUNT(order_id) > 1;
-- 3
SELECT DISTINCT customer_id FROM orders
WHERE COUNT(order_id) > 1
  AND order_date BETWEEN current_date - INTERVAL '1 month' AND current_date
GROUP BY customer_id;
-- 4
SELECT customer_id FROM orders
WHERE COUNT(order_id) > 1
  AND order_date BETWEEN current_date - INTERVAL '1 month' AND current_date
GROUP BY customer_id, order_date;
-- 5
SELECT customer_id FROM orders
WHERE order_date BETWEEN current_date - INTERVAL '1 month' AND current_date
GROUP BY customer_id, order_date HAVING COUNT(order_id) > 1;
```

> [!example]- Разбор и границы исходного ответа
>
> Из предложенных вариантов 5 имеет нужное агрегирование; 1 считает весь месяц, а 2–4 используют агрегатную функцию в WHERE. Но 5 может вернуть один customer_id несколько раз. Если order_date — timestamp, нужно группировать по календарному дню с выбранным часовым поясом; если DATE, дневная группировка уже соответствует условию. Уточните «последний месяц», верхнюю границу и DISTINCT результата. Исходная оценка «5 корректен» скрывала эти условия.
>

## JOIN с повторяющимися ключами

Даны таблицы table_a(id,num_a) и table_b(id,num_b). Найдите строки результата и объясните кратность. Затем замените INNER на LEFT/RIGHT/FULL JOIN и обсудите строки без пары и NULL.

```text
table_a: (0,1), (1,1), (2,3)
table_b: (0,1), (1,1), (2,2)
```

```sql
SELECT table_a.num_a, table_b.num_b
FROM table_a INNER JOIN table_b ON table_a.num_a = table_b.num_b;
```

ID в условии не используется для соединения. Не устраняйте повторы через DISTINCT без изменения требования.

> [!example]- Разбор
>
> У num=1 по две строки с каждой стороны: каждая левая сочетается с каждой правой, поэтому INNER JOIN даёт четыре строки (1,1). Значения 3 слева и 2 справа пары не имеют. ID не участвует в ON и не ограничивает кратность.
>
> LEFT JOIN добавляет (3,NULL), RIGHT JOIN — (NULL,2), FULL JOIN добавляет обе строки. Два одинаковых значения результата не означают один и тот же исходный объект: чтобы увидеть происхождение, временно выбираю также оба id. Для значения с m левыми и n правыми строками получается m×n пар. Сравнение NULL через = не даёт true, поэтому два NULL не соединяются этим условием.
>
> Проверки: набор из условия, отсутствующая пара, повторяющиеся ключи и NULL. DISTINCT уберёт одинаковые проекции, но изменит требуемую кратность и не исправит ошибочное условие соединения.

## SQL: рестораны, заказы и накопительная комиссия

Даны таблицы:

```sql
orders(order_id bigint PRIMARY KEY, user_id bigint, vendor_id bigint,
       products_count bigint, products_sum float, order_date timestamp)
vendors(vendor_id bigint PRIMARY KEY, vendor_name varchar(64), take_rate float)
```

Напишите запросы:

1. Топ-10 ресторанов по числу заказов за последний месяц.
2. Все рестораны, включая без заказов, и число их заказов.
3. Клиенты, не заказывавшие в KFC за последний месяц. Уточните, откуда брать полный список клиентов, если дана только orders.
4. Топ-3 ресторана по заказам в каждом месяце за последние 12 месяцев.
5. Для каждого user_id: revenue = сумма комиссии с заказов, total_revenue = комиссия со всех клиентов, share и cumulative_share. У последней строки cumulative_share=100%. Согласуйте порядок накопления и единицы take_rate.

Пример пятого результата: revenue 500 при total_revenue 100000 → share 0,5%; следующая строка revenue 1500 → share 1,5%, cumulative_share 2%.

> [!example]- Разбор
>
> Ниже диалект PostgreSQL; :from и :to — параметры согласованного полуинтервала дат. «Последний месяц» сначала определяю как предыдущий календарный месяц либо скользящий период; это разные результаты. Для группировки месяцев согласую часовой пояс.
>
> 1. Группирую заказы периода по vendor_id, сортирую count DESC и vendor_id для устойчивых равенств, беру LIMIT 10. Названия присоединяю после агрегирования.
>
> ~~~sql
> SELECT v.vendor_id, v.vendor_name, count(o.order_id) AS orders_count
> FROM vendors v
> JOIN orders o ON o.vendor_id = v.vendor_id
> WHERE o.order_date >= :from AND o.order_date < :to
> GROUP BY v.vendor_id, v.vendor_name
> ORDER BY orders_count DESC, v.vendor_id
> LIMIT 10;
> ~~~
>
> 2. Для всех ресторанов меняю JOIN на LEFT JOIN и условия периода переношу в ON. Считаю count(o.order_id), не count(*): строка ресторана без заказов должна дать ноль. WHERE по полям заказа после LEFT JOIN мог бы удалить её.
>
> 3. Для клиентов использую NOT EXISTS на заказы выбранного ресторана в периоде. Полного списка клиентов в условии нет: DISTINCT user_id FROM orders вернёт только когда-либо заказывавших. Нужна таблица users, если должны попасть и клиенты без единого заказа. Ресторан лучше определять стабильным vendor_id, а не неуникальным названием.
>
> 4. Сначала агрегирую count по date_trunc('month',order_date) и vendor_id за двенадцать месяцев, затем row_number() OVER (PARTITION BY month ORDER BY count DESC,vendor_id). Оставляю rn<=3. Если нужно включить все ничьи, выбираю rank/dense_rank по согласованному правилу и допускаю больше трёх строк.
>
> 5. Предполагаю take_rate долей, например 0.1, и накопление по возрастанию revenue, затем user_id. Если ставка задана процентами, её нужно делить на 100. Для исторических комиссий ставка должна соответствовать моменту заказа: текущая vendors.take_rate не восстанавливает прошлые изменения.
>
> ~~~sql
> WITH revenue AS (
>   SELECT o.user_id,
>     sum(o.products_sum::numeric * v.take_rate::numeric) AS revenue
>   FROM orders o JOIN vendors v USING (vendor_id)
>   GROUP BY o.user_id
> ), totals AS (
>   SELECT *, sum(revenue) OVER () AS total_revenue,
>     sum(revenue) OVER (
>       ORDER BY revenue, user_id ROWS UNBOUNDED PRECEDING
>     ) AS running_revenue
>   FROM revenue
> )
> SELECT user_id, revenue, total_revenue,
>   100 * revenue / nullif(total_revenue, 0) AS share,
>   100 * running_revenue / nullif(total_revenue, 0) AS cumulative_share
> FROM totals ORDER BY revenue, user_id;
> ~~~
>
> Последняя доля равна 100% только при ненулевом знаменателе. Накопление делаю из исходных сумм, не округлённых процентов. float в исходной схеме уже мог потерять точность; cast не восстановит её. Для точных денежных расчётов нужен согласованный decimal/minor-unit контракт. Проверки: ресторан без заказов, границы периода, равные места, клиент без заказов, нулевая общая сумма и порядок накопления.

## SQL: книги авторов и разбиение на страницы

В исходных запросах используются `books(title, publish_year, cost, author_id)` и `authors(id, name)`. Типы полей и тестовые строки не предоставлены.

1. Выведите книги с 10-й по 15-ю включительно: название, стоимость, год публикации и имя автора, с сортировкой по году публикации. Уточните направление и устойчивый порядок книг одного года.
2. Выведите только книги авторов, у которых средняя стоимость книги выше 150 у.е.; разбиение на страницы не требуется.
3. Объясните, как исследовать план запроса и проверить влияние индекса.

> [!example]- Разбор после самостоятельной попытки
>
> В исходнике `LIMIT 5 OFFSET 10` не соответствует включительно позициям 10…15 при нумерации с единицы: для них нужны шесть строк и пропуск девяти. Для устойчивой пагинации требуется согласованный порядок, которого один год публикации не задаёт. Конкретные типы и результаты внешнего примера не восстановлены.
>
