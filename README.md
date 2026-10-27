# Todo (todo-app)

Quasar + Vue 3 + Pinia приложение со списком задач и локальным mock API.

## Установка

```bash
npm install
npm install --prefix mock
```

## Запуск

Mock API и приложение запускаются в двух терминалах:

```bash
npm run mock   # http://localhost:3002
npm run dev    # http://localhost:9005
```

Vite проксирует запросы `/api` на mock-сервер (`quasar.config.ts`).

Демо-пользователи: `Алексей`, `Мария`, `Иван`. Пароль: `demo`.
Регистрация создаёт нового пользователя в `mock/db.json`.

Сбросить mock-данные:

```bash
npm run seed --prefix mock
```

## Проверки

```bash
npm run typecheck
npm run lint:check
npm test              # unit и компонентные тесты
npm run test:coverage # тесты + отчёт о покрытии
npm run verify        # typecheck + lint + тесты с покрытием
npm run build
node mock/smoke.mjs   # при запущенном mock-сервере
```

## Устройство API-слоя (практика 8)

- `src/services/apiClient.ts` — общий Axios-клиент: подстановка access-токена,
  автоматическое обновление токена при `401`, повтор запросов при сетевых
  ошибках и `502/503/504`, короткий кэш GET-ответов и дедупликация
  одинаковых параллельных запросов.
- `src/services/authService.ts` — `login`, `register`, `refreshToken`.
- `src/services/todoService.ts` — CRUD задач и клиентская валидация названия.
- `src/services/userService.ts` — профиль и настройки пользователя.
- `src/services/types.ts` — интерфейсы всех ответов API.
- `src/composables/useAsync.ts` — загрузка, ошибки, отмена (`AbortController`);
  поддерживает как последовательные, так и параллельные операции.
- `src/composables/useApi.ts` — единая точка доступа к сервисам для stores.
- Stores не делают HTTP-запросов напрямую, а компоненты не работают с API:
  ошибки и загрузка приходят из store, действия с задачами блокируются на
  время запроса, а на странице задач есть баннер с повтором запроса.

Токены хранятся в Pinia + `localStorage`, глобальных переменных для них нет.

## Валидация и обработка ошибок (практика 9)

### Валидация

- `src/utils/validation.ts` — единственный источник правил: Zod-схемы имени,
  email, пароля, подтверждения пароля, названия задачи и настроек. Здесь же
  пользовательские сообщения, кастомные правила (`customRules`, `runRules`) и
  асинхронная проверка уникальности email (`createEmailAvailabilityRule`) с
  кэшем результатов.
- `src/utils/formHelpers.ts` — адаптеры для Quasar: `ruleFromSchema`,
  `customRule`, `combineRules`, `sameValueRule` и `debounce`. Правила для
  `q-input` берутся из тех же схем, поэтому не дублируются.
- `src/composables/useValidation.ts` — хук формы: значения, ошибки, touched,
  валидация в реальном времени с задержкой, асинхронные проверки, `submit`,
  `reset` и `applyServerError`.
- `src/components/FormError.vue` — единый компонент вывода ошибок под полем и
  баннером формы, с кнопкой повтора для сетевых ошибок.

Формы входа, регистрации, добавления задачи и настройки используют
`useValidation` и `FormError`. Регистрация требует имя, email и пароль;
доступность email проверяется через `GET /api/auth/check-email`, а при отправке
сервер повторно проверяет те же правила.

### Обработка ошибок

- `src/utils/errorHandling.ts` — центральный конвейер:
  - доменные исключения `ValidationException`, `BusinessException`,
    `NetworkException`, `NotFoundException`, `StorageException`,
    `UnexpectedException`;
  - strategy pattern (`AppErrorStrategy`, `CanceledStrategy`,
    `ExceptionStrategy`, `ZodStrategy`) превращает любую причину в `AppError`;
  - `sanitizeUserMessage` / `toUserMessage` не пропускают технические детали
    (стек, имена классов, HTML, управляющие символы) в интерфейс;
  - журнал ошибок с ограничением размера, `reportError` — единственная точка
    отчёта, `withRetry` — повтор с экспоненциальной задержкой.
- `src/composables/useErrorHandler.ts` — переиспользуемый API для компонентов:
  `handle`, `run`, `retry`, `clear`.
- `src/stores/uiStore.ts` — показывает нормализованную ошибку через Quasar
  `Notify` и добавляет действие «Повторить», если ошибка повторяемая.
- `src/boot/errorHandler.ts` — глобальный обработчик: ошибки Vue,
  `window.error` и `unhandledrejection` попадают в общий конвейер.
- `src/services/apiClient.ts` — преобразует HTTP-ответы в доменные исключения,
  повторяет сетевые ошибки и `429/502/503/504`.

Технические подробности остаются в консоли и журнале, пользователь видит
только понятное сообщение.

### Серверная валидация (mock)

`mock/middlewares/auth.js` повторяет правила регистрации, названия задачи и
настроек: некорректный email/пароль, занятые имя и email (`409`), пустое или
слишком длинное название задачи. Smoke-тест проверяет эти сценарии:

```bash
npm run mock
node mock/smoke.mjs
```

## Тестирование (практика 10)

Стек: Vitest 5, Vue Test Utils 2, jsdom и `@vitest/coverage-v8`.
Quasar-компоненты в тестах настоящие: `@quasar/vite-plugin` подключает их так же,
как в приложении, поэтому проверяется поведение, которое видит пользователь,
а не заглушки.

### Структура тестов

```text
tests/
├── unit/
│   ├── composables/
│   │   ├── useTodoFilter.spec.ts   # связь composable с Pinia store
│   │   └── useValidation.spec.ts   # валидация, debounce, async-правила, submit
│   ├── stores/
│   │   └── todoStore.spec.ts       # загрузка, CRUD, ошибки, retry, фильтры
│   └── utils/
│       ├── validation.spec.ts      # схемы, кастомные правила, async email
│       └── errorHandling.spec.ts   # классификация, логи, retry, глобальный handler
├── components/
│   ├── TodoItem.spec.ts            # отображение, checkbox, удаление, pending
│   ├── TodoForm.spec.ts            # валидация, отправка, загрузка
│   └── TodoList.spec.ts            # фильтрация, поиск, пустые состояния, события
├── mocks/
│   └── api.ts                      # фейковый API-слой и фабрики данных
└── setup.ts                        # Quasar, jsdom-полифиллы, очистка окружения
```

### Моки API

`tests/mocks/api.ts` содержит управляемый фейк `authApi`, `userApi` и `todoApi`.
В тестах store модуль `@/composables/useApi` заменяется через `vi.mock`, поэтому:

- реальные HTTP-запросы не выполняются;
- можно вернуть успех (`apiSuccess`), ошибку (`apiFailure`) или отложенный ответ
  (`deferred`) и проверить состояния загрузки и `pending`;
- сетевые ошибки, отмена запроса, ошибки валидации и повтор действия
  проверяются отдельными сценариями.

Проверяются только публичные API модулей и компонентов: экспортируемые функции,
props, события и текст, который видит пользователь. Внутренние детали реализации
не проверяются.

### Покрытие

```bash
npm run test:coverage
```

Отчёт создаётся в `coverage/`: `coverage/index.html` для просмотра в браузере,
`coverage/lcov.info` для CI и `coverage/coverage-summary.json` для сводки.
В `vitest.config.ts` задан порог 80% по statements, branches, functions и lines
для критических модулей; при его снижении команда завершается с ошибкой.

Текущее покрытие критических модулей — около 97% строк и 93% ветвей.

### CI

`.github/workflows/ci.yml` запускается на push и pull request:

1. `npm ci`;
2. `npm run typecheck` — включая тесты (общий `tsconfig`);
3. `npm run lint:check` — ESLint и Prettier для `src`, `tests` и конфигурации;
4. `npm run test:coverage` — тесты с проверкой порогов;
5. сводка покрытия добавляется в job summary, отчёт загружается артефактом.

Тесты также выявили и помогли исправить ошибку в конвейере ошибок: доменные
исключения (`ValidationException`, `BusinessException` и другие) структурно
похожи на `AppError`, поэтому раньше они перехватывались стратегией
«уже нормализованная ошибка» и обходили очистку технического сообщения.
Теперь `ExceptionStrategy` выполняется раньше `AppErrorStrategy`, а
`CanceledStrategy` — первой.

## Подготовка к продакшену (практика 11)

### Окружения и переменные

Клиентские переменные описаны в `src/env.d.ts` и загружаются из:

- `.env` — общие безопасные значения;
- `.env.development` — локальная разработка;
- `.env.production` — production-сборка;
- переменных CI (`process.env`) — они имеют приоритет над файлами.

В репозиторий не попадают `.env.local` и реальные секреты. В клиентский бандл
попадают только переменные с префиксами `VITE_` и `QCLI_`. Флаги читаются через
`src/utils/env.ts`: Quasar подставляет `true`/`false` и числа литералами, поэтому
сравнение со строкой `'true'` работало бы неверно.

Основные переменные:

| Переменная                 | Назначение                            |
| -------------------------- | ------------------------------------- |
| `VITE_API_BASE_URL`        | префикс API (`/api`)                  |
| `VITE_BASE_PATH`           | базовый путь SPA (`/` или `/<repo>/`) |
| `VITE_PUBLIC_SITE_URL`     | канонический URL сайта для SEO        |
| `VITE_USE_MOCK_API`        | браузерный demo API для GitHub Pages  |
| `VITE_SENTRY_ENABLED`      | включает транспорт мониторинга        |
| `VITE_MONITORING_ENDPOINT` | необязательный приёмник событий       |

### Сборка и оптимизация

- `quasar build` использует Terser: удаляются `console.*`, `debugger` и
  комментарии; source maps отключены.
- Маршруты и тяжёлые компоненты загружаются лениво (`() => import(...)`).
- `npm run clean` удаляет `dist/` и `reports/`, чтобы старые хэшированные файлы
  не попадали в отчёт и артефакт.
- `npm run build:analyze` собирает приложение и строит treemap
  `reports/bundle-stats.html`.
- `npm run analyze` проверяет бюджеты и пишет `reports/bundle-report.json` и
  `reports/bundle-report.md`. Текущий результат: ~150 КБ JavaScript (gzip) и
  ~37 КБ CSS (gzip).

### GitHub Pages

`.github/workflows/deploy.yml` на каждый push в `main`/`master`:

1. вычисляет базовый путь (`/` для `<owner>.github.io`, `/<repo>/` для project
   pages);
2. собирает SPA с `VITE_USE_MOCK_API=true`, чтобы демо работало без backend;
3. проверяет бюджеты бандла и наличие `dist/spa/404.html`;
4. публикует `dist/spa` через `actions/deploy-pages`.

Для history-режима хук `afterBuild` копирует `index.html` в `404.html`, поэтому
прямые ссылки на `/settings` не ломаются. В `public/` также лежат `_redirects`,
`_headers`, `.nojekyll` и `robots.txt`.

Чтобы включить деплой: создайте репозиторий на GitHub, запушьте проект и в
**Settings → Pages → Source** выберите **GitHub Actions**.

Локальная проверка production-сборки:

```bash
npm run build
npm run preview      # http://localhost:4173
```

### SEO

- Статические мета-теги, Open Graph и Twitter Card находятся в `index.html`.
- `src/services/seo.ts` обновляет `title`, `description`, `robots`, canonical и
  Open Graph после каждой навигации; описания заданы в `src/router/routes.ts`.
- `public/robots.txt` разрешает индексацию публичных страниц и закрывает
  служебные разделы.
- Страницы входа и списка задач индексируются, служебные (`/settings`, 404) —
  закрыты через `noindex`.

### Мониторинг

`src/services/monitoring.ts` — лёгкий Sentry-совместимый клиент без SDK:
ошибки из общего конвейера, хлебные крошки, навигационные метрики и Core Web
Vitals складываются в ограниченную очередь. При заданном
`VITE_MONITORING_ENDPOINT` события отправляются через `fetch`; без него клиент
работает в mock-режиме и ничего не отправляет. Персональные данные не
собираются: передаются только id, имя и email текущего пользователя.

### Финальная проверка

```bash
npm run verify            # типы, линт, тесты с покрытием
npm run build:analyze     # сборка + отчёт о размере
npm run audit:lighthouse  # сборка + Lighthouse (desktop)
npm run audit:lighthouse:mobile # сборка + Lighthouse (mobile)
node mock/smoke.mjs       # smoke-тест mock-сервера
```

Lighthouse нужно запускать только против production-сборки. `npm run dev`
отдаёт несжатые модули Vite (около 10 МБ JavaScript), поэтому DevTools
показывает заниженные 50–60 баллов. Команды `audit:lighthouse*` сами собирают
production-бандл и поднимают preview-сервер с gzip/brotli.

Результаты Lighthouse для production-сборки: desktop — performance 100,
accessibility 100, best-practices 100, SEO 100; mobile — performance 92,
accessibility 100, best-practices 100, SEO 100. Проверены вход через mock API,
создание задачи, переход в настройки, прямые ссылки в history-режиме и
отсутствие ошибок в консоли.
