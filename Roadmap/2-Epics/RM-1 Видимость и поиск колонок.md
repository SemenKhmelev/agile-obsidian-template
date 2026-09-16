---
title:
key: RM-1
order: 1
lane: Таблицы
term: 2 спринта
status: in-flight
start: 2024-01-08
end: 2024-02-16
horizon: 2024
tags:
  - epic
parent: "[[Настройка таблиц пользователем]]"
dependents:
---
> [!hint]- Памятка
> * `dependents` — ссылки на итерации, от которых зависит текущая.
> * `parent` — родительская итерация (как правило theme).
> * `horizon` — горизонт планирования (год, квартал и т.п.).
> * `track` — FE (FrontEnd), BE и т.п.
> * `title` — заголовок; если пусто, используется имя файла.

```dataviewjs
await dv.view("views/roadmap-iteration-summary", { dv });
```

## Описание

Диалог настройки видимости колонок с поиском, сохранение выбора пользователя.

## Элементы

```dataviewjs
await dv.view("views/roadmap-epic-elements", { dv });
```
