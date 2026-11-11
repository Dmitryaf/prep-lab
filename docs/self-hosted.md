# Установка и хранение Prep Lab

Один экземпляр принадлежит одному владельцу. Внутренних пользовательских аккаунтов приложения нет: доступ к HTTP означает доступ к материалам и операциям экземпляра.

## Docker

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Откройте `http://127.0.0.1:4173`. Compose привязывает порт к loopback и сохраняет данные в `instance-data`, смонтированном как `/data`. Read-only root filesystem и временный `/tmp` заданы в `compose.yaml`.

Остановка: `docker compose down`. Не добавляйте `-v`, если нужны данные. Сохраняйте прежнее имя Compose-проекта при обновлении, иначе будет выбран другой том. Данные прежнего Node-запуска из `.local/` автоматически в Docker не переносятся.

Порт и адрес приложения настраиваются по [.env.example](../.env.example). Для удалённого доступа нужны HTTPS reverse proxy с сохранением Host и поддержкой streaming либо SSH-туннель, а также ограничение доступа владельцу. Настроенный адрес приложения должен совпадать с адресом браузера.

## Node.js

Диапазон Node.js указан в `package.json`: `^22.22.3 || ^24.15.0 || >=26.0.0`.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Данные находятся в `.local/`; `FRONTEND_LAB_DATA_DIR` выбирает другой корень. При переносе сохраните весь каталог, включая личную базу, SQLite и подключение помощника. Сборку выполняйте для целевой системы.

## Серверные источники

Для загрузки через браузер mount не нужен. Для чтения папки создайте `compose.override.yaml`:

```yaml
services:
  app:
    volumes:
      - type: bind
        source: /absolute/knowledge
        target: /sources/personal
        read_only: true
```

```sh
docker compose up -d
docker compose exec app node --experimental-strip-types /app/admin/scripts/sources.ts allow personal "Моя база" /sources/personal
```

В интерфейсе укажите серверный путь. Исходные файлы не изменяются.

## Backup и обновление

Остановите writer и сохраните постоянный том целиком в закрытом хранилище. Например, с заранее подготовленной доступной контейнеру папкой:

```sh
docker compose stop app
docker compose run --rm --no-deps --volume /absolute/backup:/backup --entrypoint tar app -C /data -czf /backup/prep-lab-data.tar.gz .
docker compose start app
```

Проверьте наличие копии до обновления исходников. Затем выполните `docker compose down --remove-orphans` и `docker compose up -d --build`, сохраняя имя Compose-проекта и постоянный том. Копия включает личные материалы и credentials помощника. Восстанавливайте в отдельный пустой том при остановленном сервере; не распаковывайте поверх работающей SQLite.

`/api/health` проверяет доступность процесса; healthcheck Compose использует тот же endpoint. После восстановления отдельно проверить свои материалы, прогресс, обсуждения и подключение помощника. Подключение описано в [assistant-connection](assistant-connection.md).
