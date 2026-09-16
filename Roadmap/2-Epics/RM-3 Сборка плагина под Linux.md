---
title:
key: RM-3
order: 1
lane: Сборка
term: 3 спринта
status: in-flight
start: 2024-01-08
end: 2024-03-01
horizon: 2024
tags:
  - epic
parent: "[[Кроссплатформенная поставка]]"
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

Сборка и публикация браузерного плагина под Linux в общем конвейере.

## Элементы

```dataviewjs
await dv.view("views/roadmap-epic-elements", { dv });
```
