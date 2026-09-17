---
name: run-obsidian
description: Use when a change to this vault (_scripts/*.js startup scripts, .obsidian/snippets/*.css, kanban board, user feed, reports, roadmap views) must be checked in the real Obsidian app rather than a static mock, or when asked to launch Obsidian, screenshot the board or feed, or inspect the live DOM. Проверить в настоящем Obsidian, запустить Obsidian, скриншот доски или ленты.
---

# Запуск и проверка Obsidian

Настоящий Obsidian (Electron) под управлением скрипта: CDP по отладочному порту,
драйвер `driver.mjs` рядом. Работает на **копии** vault без `.git` и с выключенным
obsidian-git — ничего не коммитит и не пушит. Копия снимается при `start`, поэтому
после правок vault: `stop`, затем `start`.

Команды запускаются из корня vault.

## Команды

```bash
D=.agents/skills/run-obsidian/driver.mjs
node $D start                      # копия vault, Obsidian; ждёт плагины и индекс (~20 с)
node $D open sprint2/board         # открыть заметку по пути в vault
node $D feed Селезнева dark        # правый клик по аватарке → скриншот ленты + замеры сетки
node $D shot board ".workspace"    # скриншот окна или элемента по CSS
node $D shot card ".kanban-plugin__item" 3   # элемент в тройном разрешении (чёткий текст)
node $D eval 'app.workspace.getActiveFile()?.path'   # JS в окне, результат JSON
node $D theme light                # moonstone / obsidian
node $D stop
```

Скриншоты — в `/tmp/run-obsidian/shots/`; **откройте их и посмотрите**, JSON-замеров мало.
`feed` печатает координаты колонок первого дня ленты и ошибки консоли за время команды.

Переменные окружения:

| Переменная | Зачем |
|---|---|
| `OBSIDIAN_VAULT` | другой vault вместо этого репозитория |
| `OBSIDIAN_BIN` | путь к Obsidian, если он установлен нестандартно |
| `OBSIDIAN_XVFB=1` | принудительно поднять виртуальный дисплей, даже когда есть свой |
| `RUN_DIR` | где держать копию vault и скриншоты (по умолчанию `/tmp/run-obsidian`) |
| `OBSIDIAN_DISPLAY`, `OBSIDIAN_CDP_PORT` | номер дисплея (`:99`) и порт отладки (`9333`) |

Новые сценарии — новой командой в `COMMANDS` драйвера, по образцу `feed`.

## Что нужно на машине

- **Node.js 22+** — драйвер говорит с Obsidian через встроенный `WebSocket`.
- **Obsidian**. Драйвер сам ищет его в обычных местах: `/opt/obsidian/obsidian`,
  `/usr/bin/obsidian`, `/usr/local/bin/obsidian`, flatpak-обёртка,
  `/Applications/Obsidian.app/Contents/MacOS/Obsidian`. Нестандартная установка —
  через `OBSIDIAN_BIN`.
- **На машине с рабочим столом больше ничего не нужно**: Obsidian откроется обычным окном.
- **На машине без дисплея** (сервер, контейнер, CI) нужен `Xvfb` и библиотеки, которые
  тянет Electron. В Debian и Ubuntu:

  ```bash
  sudo apt-get install -y xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 \
    libgbm1 libasound2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2
  ```

  Дисплея нет — драйвер поднимет `Xvfb` сам, отдельной команды не нужно.

## Грабли

- **`xvfb-run`** требует `xauth`, которого может не быть → драйвер запускает `Xvfb` напрямую.
- **`WAYLAND_DISPLAY`** уводит Electron в Wayland мимо отладочного порта → драйвер его убирает.
- **Playwright `connectOverCDP` не использовать**: после команды, отрендерившей markdown,
  следующее подключение зависает (автоподключение к воркерам с ожиданием отладчика),
  а `browser.close()` закрывает сам Obsidian. Драйвер говорит с CDP через WebSocket.
- **Индекс**: `dataview.index.initialized` наступает раньше, чем проиндексирована копия, —
  лента тогда показывает старые дни без дробей. `start` ждёт
  `metadataCache.inProgressTaskCount === 0` и неизменную ревизию индекса Dataview.
- **Диалог «Trust author»** при первом открытии копии драйвер нажимает сам.
- **Панель аватарок** стартовый скрипт дорисовывает после рендера доски — команды её ждут.
- **Останавливать через `stop`**, а не `pkill -f <шаблон>`: шаблон совпадает с командной
  строкой самой оболочки, и она убивает себя (код 144).
- **Зум окна не трогать**: `webFrame.setZoomFactor` ломает съёмку элемента по CDP и роняет
  окно. Крупный план делается третьим аргументом `shot`, а не зумом.
