# Contributing

Этот файл описывает процедуры сопровождения agile-obsidian проекта. Пользовательские инструкции по работе с vault
остаются в [README.md](README.md).

## Добавление нового участника

Новый участник должен быть добавлен во все места, где проект хранит список исполнителей, аватарки и правила
отображения аватарок. Имя участника — это строка, которая попадёт во frontmatter `user` его записей и задач
(в демо-примере — «Имя Фамилия», например «Галена Селезнева»). Во всех списках ниже она должна быть записана
одинаково.

### 1. Добавить аватарку

1. Подготовить квадратную PNG-аватарку.
2. Положить файл в `_views/avatars/<slug>.png`.
3. Использовать латинский slug в нижнем регистре. Например: `Галена Селезнева -> selezneva`, файл
   `_views/avatars/selezneva.png`.

### 2. Добавить имя и slug в общий Python-список

Добавить запись в `_scripts/_devs.py`:

```python
"Галена Селезнева": "selezneva"
```

Этот список используется генератором CSS-сниппета и backfill-скриптом.

### 3. Добавить участника в шаблоны

Добавить имя в списки выбора исполнителя:

- `_templates/daily-time-tracking-file-template.md`
- `_templates/time-worked-debt-template.md`
- `_templates/task-template.md`

В `_templates/daily-time-tracking-file-template.md` также добавить slug в `devSlug`, чтобы новые записи за день
получали `cssclasses: [dev-<slug>]`.

### 4. Добавить участника в JS-списки интерфейса и отчетов

Добавить участника в списки фильтров:

- `_scripts/kanbanFilterBar.js`
- `_scripts/taskReportFilterBar.js`

Добавить slug в avatar-маппинги отчетов:

- `_views/task-report/view.js`
- `_views/task-report-design/view.js`
- `_views/spent-summary-report/view.js`

### 5. Пересобрать CSS-сниппет аватарок

Запустить из корня vault:

```bash
python3 -B _scripts/build_dev_avatars_css.py
```

Опция `-B` не дает Python создавать `__pycache__`. Скрипт обновляет `.obsidian/snippets/dev-avatars.css`; вручную этот
файл не редактировать.

Если у участника уже есть записи за день без `cssclasses`, проставить класс скриптом (по умолчанию — текущий спринт
из `_scripts/globalprops.js`):

```bash
python3 -B _scripts/backfill_cssclasses.py
python3 -B _scripts/backfill_cssclasses.py sprint1
```

## Переход с демо-примера на свою команду

1. Удалить демо-спринты `sprint1/`, `sprint2/` и демо-роадмап (`Roadmap/0-Vision`, `Roadmap/1-Themes`,
   `Roadmap/2-Epics`), завести каталог первого спринта по образцу демо (`board.md`, `board-design.md`,
   `time_debt.md`, `feedback.md`, `readme.md`, `tasks/_predefined`, `reports`).
2. Указать его имя в `_scripts/globalprops.js`, в `.obsidian/daily-notes.json` (`folder`) и в папке шаблона
   Templater (`.obsidian/plugins/templater-obsidian/data.json`, `folder_templates`).
3. Заменить демо-участников на своих во всех местах из раздела «Добавление нового участника», удалить демо-аватарки
   из `_views/avatars/` и пересобрать сниппет.

## Тесты

Чистая логика скриптов доски покрыта Node-тестами:

```bash
node --test _tests/*.test.js
```

Тесты лежат в `_tests/`, а не в `_scripts/`: Templater загружает каждый `.js` из папки пользовательских скриптов, и
тестовый файл с относительным `require` ломает вставку любого шаблона.
