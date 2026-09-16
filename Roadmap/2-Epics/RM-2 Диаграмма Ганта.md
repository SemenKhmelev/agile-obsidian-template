---
title:
key: RM-2
order: 2
lane: Таблицы
term: 2 месяца
status: todo
start: 2024-02-19
end: 2024-04-26
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

Представление таблицы в виде диаграммы Ганта: шаблоны заливки, масштаб, перетаскивание сроков.

## Элементы

```dataviewjs
await dv.view("views/roadmap-epic-elements", { dv });
```
