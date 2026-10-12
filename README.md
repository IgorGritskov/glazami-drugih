# Зеркало · Игорь глазами других — Version 0.2.1

Мобильная мини-игра обратной связи на React, TypeScript, Vite, Tailwind CSS и Motion. С необязательной pilot-аналитикой Supabase, без аккаунтов и AI-анализа.

## Запуск

Требуется Node.js 22.12+ (или 20.19+).

```sh
npm install
npm run dev -- --host 0.0.0.0
```

```sh
npm run build
npm run preview -- --host 0.0.0.0
```

## Version 0.2

Обновлён первый экран «А ты знаешь Игоря?», композиция фактов и четыре главы истории. Выборы — карточки без checkbox/radio: выбранная карточка золотая, короткие варианты размещены в две колонки (на узких экранах — одна). Сохранены лимиты, нейтральные ответы, необязательный открытый ответ и progress 1–6.

Итог — три предложения из фактических ответов и отдельный показатель доверия. Короткий заголовок следует только заданному правилу из профиля. Никаких диагнозов, AI или выдуманных баллов.

**Фото:** оригинальная фотография Игоря из `origin/main:igor-cover.JPG` оптимизирована для веба в `public/images/igor-cover.webp` (1600 × 2400, около 366 КиБ). Cover использует `object-fit: cover` и `object-position: 50% 12%` для мобильной композиции. При отсутствии файла отображается нейтральная монограмма `public/images/igor-fallback.svg`.

## Где менять контент

- `src/data/profiles/igor.ts` — профиль, факты, специализация, experience tags, четыре главы, варианты и ручные grammatical forms / summary rules.
- `src/data/copy.ts` — вопросы, подписи экранов и share payload. Биография отключается через `bioEnabled: false`; `bioCards` и `journey` необязательны. Навигация пропускает отключённые/пустые блоки.
- `src/types/profile.ts` — модель профиля, ответов и черновика. Version 0.2 хранит черновик в `mirror:igor:v2` с `version: 2`. Ключ `mirror:igor:v1` не читается, поэтому прохождение 0.1 не восстанавливается.

## Результат, PNG и share

- `src/services/resultNarrative.ts` — deterministic builder. Нейтральные potential/risk, отказ от проекта/звонка и собственный вариант обрабатываются отдельно. Русские формы заданы в профиле; неизвестные варианты цитируются буквально. Карточка Stories использует короткий шаблон, длинные собственные формулировки сокращаются с многоточием.
- `src/services/resultCard.ts` — Canvas PNG 1080×1920 с логотипом, именем, портретом, доверием и CTA. Переносы измеряются Canvas; длинные слова разбиваются; размер шрифта подстраивается в ограниченной области. Фото и сетевые ресурсы не нужны для экспорта.
- `src/hooks/useResultCard.ts` — предварительная генерация перед нажатием, чтобы сохранить user activation на iOS. Object URL освобождается при смене ответов/выходе.
- `src/services/share.ts` — file sharing через Web Share API, fallback — download PNG. `createSharePayload(card, url?)` принимает ссылку; успешный share регистрирует случайный referral ID. Отмена системного меню не считается ошибкой.
- `src/components/ResultActions.tsx` — сохранение, share, статусы и просмотр PNG. На iPhone сохранение предлагает системное меню; выбор Photos приложение не может проверить. Успешный share означает передачу файлу системного меню, а не подтверждение публикации или записи в Photos.

## Существующие сервисы

- `src/services/storage.ts` — `loadResponse` / `saveResponse`; localStorage можно заменить API. Черновик и интерес `create_mirror_interest` сохраняются на устройстве; завершённые ответы отправляются при настроенном Supabase.
- `src/services/analytics.ts` — последние 200 событий локально, console в dev. Добавлены события просмотра narrative, генерации/сохранения PNG и share; содержимое ответов не логируется.
- `src/services/platform.ts` — адаптер для будущего Telegram SDK/haptics/user/start_param/buttons.
- `src/components/Choices.tsx` — общая механика лимитов и эксклюзивных нейтральных ответов.
- `src/App.tsx` — сценарий и переходы; `src/index.css` — визуальная система, touch targets, safe areas и reduced motion.

В dev-режиме внизу есть «Прототип 0.2» → `Restart prototype`. Для проверки опубликованного preview добавьте `?prototype=1` к URL. Dev-сброс спрашивает подтверждение. На финальных экранах также есть «Пройти заново»: без подтверждения возвращает к началу и сбрасывает только анкету. `?reset=1` делает то же при открытии; параметр сразу удаляется из URL через `history.replaceState`, остальные параметры и hash сохраняются. События аналитики и `create_mirror_interest` остаются, интерес учитывается в новом прохождении.

## Проверка

`npm run build` обязателен перед публикацией. Проверены мобильные ширины 320/390/428, полный проход, refresh recovery, max selections, нейтральные/собственные ответы, 412 комбинаций narrative, PNG 1080×1920 и download fallback. Ветки file sharing / cancellation / failure проверяются mock-реализацией Web Share API. Настоящие Safari, Photos, in-app/Telegram панели и системный share sheet требуют проверки на iPhone; cloud Chromium не подтверждает их работу.

## Будущее (не реализовано)

TODO: builder с optional biography, фото и выбором вопросов. TODO: дополнительные блоки после **трёх реальных завершённых ответов** новых людей, а не за сам факт share. Конструктор, платежи, авторизация и публичный просмотр агрегированных ответов не реализованы. Pilot-backend и referral-учёт описаны ниже.

## Pilot Analytics · Version 0.2.1

Новые файлы: `src/services/supabase.ts`, `remoteAnalytics.ts`, `pilotSession.ts`, `src/components/PilotFeedback.tsx`, `supabase/schema.sql`, `.env.example`, `docs/PILOT_METRICS.md`.

**Подключение Supabase — что нажать:**

1. Откройте https://supabase.com/dashboard → **New project**. Выберите организацию, имя и регион; задайте пароль БД и сохраните его отдельно. Дождитесь запуска проекта.
2. В левом меню откройте **SQL Editor** → **New query**. Вставьте целиком содержимое `supabase/schema.sql` и нажмите **Run**. Скрипт можно выполнить повторно; он не удаляет данные.
3. Откройте **Project Settings** → **Data API** (в некоторых версиях интерфейса **API**) и скопируйте **Project URL**.
4. Откройте **Project Settings** → **API Keys**. Скопируйте **Publishable key** (`sb_publishable_…`) либо legacy **anon/public** key. **Не используйте Secret key / service_role.**
5. Для локальной разработки скопируйте `.env.example` в `.env.local` и заполните `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. Эти два публичных значения нужны для реального подключения. Перезапустите `npm run dev`; затем выполните `npm run build`.
6. Для размещённого preview задайте эти же две переменные в окружении **сборки** и пересоберите приложение: Vite встраивает `VITE_*` при build. Изменения runtime env уже собранного JS недостаточно. Сейчас код подготовлен; credentials не выдуманы, реальный backend не подключён.
7. Пройдите приложение с `?src=test&reset=1`. В Dashboard → **Table Editor** убедитесь, что появляются `mirror_sessions`, `mirror_events`, затем одна строка `mirror_responses` на завершённое прохождение. Добровольный feedback появится в `mirror_feedback`, контакт — отдельно в `mirror_leads`.
8. Для статистики откройте **SQL Editor** и вставляйте готовые запросы из [docs/PILOT_METRICS.md](docs/PILOT_METRICS.md): funnel, conversion, feedback, ответы, drop-off и referral. Список добровольных контактов смотрите в Table Editor → `mirror_leads`.

`track(event, metadata?)` сохраняет локальный fallback и ставит событие в асинхронную очередь Supabase. Черновики не отправляются на каждый выбор: финальный response ставится в очередь один раз при завершении, уникальный `session_id` в БД исключает дубли. События имеют UUID для идемпотентного повтора. Очередь переживает refresh, повторяет отправку через 30 секунд/при online и не блокирует UI. Если env отсутствуют или сеть недоступна, всё работает локально; warning показывается только в dev-консоли. Не очищайте localStorage, если хотите позже дослать накопленные локальные данные.

Каждое прохождение имеет случайный `crypto.randomUUID()` session ID и случайный токен права записи; refresh сохраняет их, restart/reset создаёт новые. `?ref=…&src=telegram&reset=1` поддерживаются вместе. Успешный Web Share регистрирует новый share ID; payload содержит URL с `ref`, но никогда session ID. Скачивание PNG не считается успешным share. Контакт предлагается только после feedback с intent yes/maybe; username 5–32 символа, начинается с буквы, допускает цифры/underscore и необязательный @. Контактные запросы не содержат session ID, токена, ref или ответов. Введённый контакт не попадает в analytics metadata.

Таблицы закрыты RLS; anon получает только EXECUTE двух ограниченных RPC. Владельцу доступны данные через Dashboard. Прямого публичного SELECT/UPDATE таблиц нет. Полный SQL и пояснения privacy находятся в `supabase/schema.sql` и документе метрик.

Реальные `.env.local`/secrets не коммитятся. `VITE_SUPABASE_ANON_KEY` — публичный клиентский ключ, не секретный серверный ключ. Контакты добровольны; основная анкета не требует имени или контакта. Реальные Supabase URL/key в текущей среде отсутствуют: проверка реальной удалённой записи возможна после их добавления.

Проверка 0.2.1: полный сценарий без env; сбой сети и восстановление очереди через mock API; отдельная отправка контакта; referral/reset; SQL-схема выполнена дважды на локальной PostgreSQL 17. Проверены ограничения anon, токены записи, отсутствие дублей и все запросы метрик. Эти проверки не заменяют проверку записи в реальный Supabase после подключения.
