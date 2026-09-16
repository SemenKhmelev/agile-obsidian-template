# Repository Instructions

Work carefully and prefer the cleanest maintainable solution over quick patches.

## Styling

When adding or changing custom styles, always account for both light and dark themes.

Prefer theme-aware Obsidian CSS variables such as `--text-normal`, `--background-primary`, `--background-secondary`,
`--background-modifier-border`, `--background-modifier-hover`, `--interactive-normal`, and `--interactive-hover` instead
of hard-coded colors.

If hard-coded colors are necessary, provide explicit `.theme-dark` overrides and verify that contrast, hover states,
borders, and disabled/focus states still read clearly in dark mode.

## Obsidian Plugins

Do not edit third-party Obsidian community plugins directly. Files under `.obsidian/plugins/*` are treated as vendored
code that may be overwritten by plugin updates.

The only local plugins that may be edited directly are:

- `.obsidian/plugins/time-comment-button` — renders the `+` button in daily time notes and resets
  stale `workspace.activeEditor` right before inserting. The vault-wide reset on `file-open` lives
  in `_scripts/resetStaleActiveEditor.js` (startup script): desktop Kanban leaves a dead card
  editor in `workspace.activeEditor`, which breaks Templater inserts ("No active editor, can't
  append templates") for both the button and the `ctrl+shift+alt+T` hotkey.
- `.obsidian/plugins/vault-startup-scripts` — runs the startup scripts listed in its `STARTUP_SCRIPTS`
  (in `main.js`) on every device. Register new startup scripts there; do not rely on Templater startup
  templates — since Templater 2.22 that setting is per-device (localStorage) and off by default.
  Inside a startup script use the `require` it receives: `require("obsidian")` returns the API module
  (`window.require("obsidian")` does not resolve in this context), other ids go to `window.require`.
  Changes to `STARTUP_SCRIPTS` or to `main.js` take effect only after an Obsidian restart.

`_scripts/` is also Templater's user-scripts folder: Templater evaluates **every** `.js` file there
through `window.require`, and one file that throws breaks every template insert (for example the
daily note button). So nothing in `_scripts/` may use relative `require("./x")` or fail at load
time without an `app` guard, and test files never go there: Node tests live in `_tests/` and
reference scripts as `require("../_scripts/x.js")`. Run them with `node --test _tests/*.test.js`.

Since 2.22 Templater keeps `enable_startup_templates`, `trigger_on_file_creation` and
`enable_system_commands` not in `data.json`, but in the device's localStorage under
`templater-local-settings`, all three off by default. They are not in git, so an update or a new device
silently breaks whatever depends on them. Restore such settings with an idempotent startup script — see
`_scripts/ensureTemplaterFileCreationTrigger.js`, which brings back template expansion in files created
by the `Open today's daily note` button.

If a change appears to require modifying a third-party plugin, do not patch that plugin. Instead, use one of these
approaches:

- implement the behavior in a local plugin;
- add vault-level CSS/snippets when styling is enough;
- add a clearly documented patch script only after discussing the trade-off with the user.

When adding a new local plugin, also update this file and add the plugin directory to the allowlist above.

Current third-party plugin directories must be treated as read-only unless the user explicitly asks to modify them:

- `.obsidian/plugins/buttons`
- `.obsidian/plugins/cm-editor-syntax-highlight-obsidian`
- `.obsidian/plugins/cmdr`
- `.obsidian/plugins/dataview`
- `.obsidian/plugins/obsidian-charts`
- `.obsidian/plugins/obsidian-git`
- `.obsidian/plugins/obsidian-kanban`
- `.obsidian/plugins/obsidian-markmind`
- `.obsidian/plugins/obsidian-plantuml`
- `.obsidian/plugins/quickadd`
- `.obsidian/plugins/templater-obsidian`

## Внесение времени

Человек заводит запись за день кнопкой `Open today's daily note` (см. [README.md](README.md)),
агенту эта кнопка недоступна — он создаёт файл `sprintN/comments/ГГГГ-ММ-ДД-Участник.md`
сам, копируя структуру предыдущей записи того же исполнителя: frontmatter с `user`,
`cssclasses` и тегами, dataview-блок с итогом за день, разделы «Время на ритуалы спринта»
и «Время на задачи спринта», справку в конце.

Списание — элемент списка из трёх полей и текста-описания:

```markdown
* [cardref:: [[sprint2/tasks/_predefined/Сопутствующая деятельность|Сопутствующая деятельность]]]
  [action::sd]
  [spent:: 4.7]
  Что именно делалось.
```

- `cardref` — ссылка на карточку задачи; для всего, что не входит в задачи спринта,
  берётся карточка из `sprintN/tasks/_predefined/` (планирование и митинги, найм, поддержка,
  документация, сопутствующая деятельность, анализы, другое).
- `action` — тип работы из списка в `_templates/time-spent-comment-template.md`. Учтите,
  что справка внутри файлов комментариев неполна: в шаблоне есть ещё `devops`.
- `spent` — часы десятичной дробью (`0.6`, `1.3`, `4.7`), не «часы:минуты».

Правила, которые не выводятся из формата:

- Оценивая часы, не выдумывайте их за человека: спросите. Ориентир для ритуалов — сколько
  за тот же день внесли коллеги, это видно в соседних файлах `comments/`.
- Чужие записи и прошедшие дни не редактировать без явной просьбы.
- Проверять внесённое стоит не глазами, а Dataview: блок в шапке файла даёт итог за день,
  а `app.metadataCache.unresolvedLinks` покажет, что `cardref` указывает в никуда —
  такая запись молча выпадет из отчётов спринта.

## Git в vault команды

Правила ниже — для vault, который команда ведёт по этому шаблону. Стандарта сообщений там нет —
и не нужно переносить туда правила из репозиториев кода.
Обычные коммиты делает плагин obsidian-git из интерфейса, с сообщением `vault backup: <дата>`;
мерж-коммиты с `origin/main` — нормальная часть истории, вычищать их не надо.

- Агент коммитит одной осмысленной строкой по-русски, без префиксов и трейлеров.
- Перед push подтянуть изменения: у каждого свой файл в `comments/`, конфликты редки,
  но бэкапы прилетают часто.
- Если `git status` показывает удалённые файлы, которых нет на диске, — **не** делать
  `git add -A` и `git commit -a`: так фиксируется удаление того, чего у вас просто нет.
  Причина почти всегда одна, см. ниже.

## Длина имени заметки

Имя файла на ext4 ограничено 255 байтами, а кириллица в UTF-8 занимает два байта на символ —
то есть около 127 русских символов. Более длинное имя нельзя создать на Linux вообще:
`git clone` завершается ошибкой `File name too long`, заметка не появляется в рабочем дереве,
и git считает её удалённой. На Windows такие имена работают (NTFS считает лимит в символах),
поэтому проблему замечает только тот, кто работает из WSL или контейнера.

Держите имена задач в пределах ста символов. Если длинное имя уже создано — переименуйте
заметку в Obsidian (он сам обновит ссылки), а не через файловую систему.
