"""Общая мапа «имя участника (значение `user` во frontmatter) → латинский slug».

Используется Python-скриптами в этом каталоге (генератор CSS-сниппета,
backfill cssclasses, backfill userAvatar). Имя slug совпадает с именами
файлов в _views/avatars/<slug>.png.

JS-сторона (_scripts/kanbanFilterBar.js) поддерживает аналогичный список
самостоятельно — менять оба места при добавлении/удалении разработчика.
"""

SLUG = {
    "Галена Селезнева": "selezneva",
    "Ангел Весельчак": "veselchak",
    "Кости Герасимов": "gerasimov",
    "Ксаеро Великанов": "velikanov",
}
