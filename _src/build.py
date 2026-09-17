#!/usr/bin/env python3
"""Собирает русскую и английскую версии статического сайта."""

from __future__ import annotations

import html
import re
import shutil
import tomllib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_src"
SECTIONS = ("hero", "stack", "data", "text", "agents", "workflow", "artifacts", "limits", "start")
SITE_URL = "https://semenkhmelev.github.io/agile-obsidian-template/"

PLACEHOLDER_RE = re.compile(r"{{\s*([\w.-]+)\s*}}")
LOOP_RE = re.compile(
    r"<!--\s*BEGIN loop:([\w.-]+)\s*-->(.*?)<!--\s*END loop:\1\s*-->",
    re.DOTALL,
)
IF_RE = re.compile(
    r"<!--\s*BEGIN if:([\w.-]+)\s*-->(.*?)<!--\s*END if:\1\s*-->",
    re.DOTALL,
)


class BuildError(RuntimeError):
    """Ошибка шаблона с понятным сообщением для автора сайта."""


def resolve(data: dict[str, Any], path: str, item: Any = None) -> Any:
    """Возвращает значение по пути; отсутствие ключа всегда считается ошибкой."""
    if path == "item":
        if item is None:
            raise BuildError("{{item}} использован вне цикла")
        return item

    parts = path.split(".")
    if parts[0] == "item":
        if item is None:
            raise BuildError(f"{{{{{path}}}}} использован вне цикла")
        value = item
        parts = parts[1:]
    else:
        value = data

    for part in parts:
        # числовой шаг — обращение к элементу массива: rows.0.title
        if isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
            continue
        if not isinstance(value, dict) or part not in value:
            raise BuildError(f"Не найден ключ шаблона: {path}")
        value = value[part]
    return value


def markdown(value: Any) -> str:
    """Экранирует HTML и поддерживает только ссылки, код и жирное начертание."""
    if not isinstance(value, (str, int, float)):
        raise BuildError(f"В текстовый плейсхолдер передано не скалярное значение: {value!r}")
    text = html.escape(str(value), quote=True)
    text = re.sub(
        r"\[([^\]]+)\]\(([^\s)]+)\)",
        r'<a href="\2">\1</a>',
        text,
    )
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return text


def render(template: str, data: dict[str, Any], item: Any = None) -> str:
    """Рендерит мини-шаблон: BEGIN loop:path повторяет блок для элементов массива."""
    def loop_replace(match: re.Match[str]) -> str:
        values = resolve(data, match.group(1), item)
        if not isinstance(values, list):
            raise BuildError(f"Цикл {match.group(1)} ожидает массив")
        return "".join(render(match.group(2), data, child) for child in values)

    def if_replace(match: re.Match[str]) -> str:
        value = resolve(data, match.group(1), item)
        return render(match.group(2), data, item) if value else ""

    # Комментарии BEGIN/END делают циклы и условия заметными прямо в HTML-шаблонах.
    while LOOP_RE.search(template):
        template = LOOP_RE.sub(loop_replace, template)
    while IF_RE.search(template):
        template = IF_RE.sub(if_replace, template)

    return PLACEHOLDER_RE.sub(lambda match: markdown(resolve(data, match.group(1), item)), template)


def load_content(language: str) -> dict[str, Any]:
    path = SRC / "content" / f"{language}.toml"
    with path.open("rb") as stream:
        data = tomllib.load(stream)

    image_sizes = {
        "board.webp": (1500, 690),
        "daily.webp": (1500, 960),
        "feed.webp": (760, 850),
        "charts.webp": (1500, 880),
        "palette.webp": (1396, 390),
    }
    for step in data["workflow"]["steps"]:
        step["shot_width"], step["shot_height"] = image_sizes.get(step["shot"], (0, 0))
    return data


def build_language(language: str) -> None:
    data = load_content(language)
    is_english = language == "en"
    data["site"] = {
        "asset_prefix": "../assets/" if is_english else "assets/",
        "canonical": f"{SITE_URL}en/" if is_english else SITE_URL,
        "canonical_ru": SITE_URL,
        "canonical_en": f"{SITE_URL}en/",
        "alt_lang": "ru" if is_english else "en",
        "close_label": "Close" if is_english else "Закрыть",
    }

    sections: dict[str, str] = {}
    for name in SECTIONS:
        template = (SRC / "sections" / f"{name}.html").read_text(encoding="utf-8")
        sections[name] = render(template, data)

    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    for name, section in sections.items():
        marker = "{{#" + name + "}}"
        if marker not in layout:
            raise BuildError(f"В layout.html нет слота секции: {marker}")
        layout = layout.replace(marker, section)
    leftovers = re.findall(r"{{#([^}]+)}}", layout)
    if leftovers:
        raise BuildError(f"Не заполнены слоты секций: {', '.join(leftovers)}")

    output = ROOT / "en" / "index.html" if is_english else ROOT / "index.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(layout, data), encoding="utf-8")
    print(f"Собран {output.relative_to(ROOT)}")


def copy_assets() -> None:
    source = SRC / "assets"
    destination = ROOT / "assets"
    destination.mkdir(exist_ok=True)
    for path in source.rglob("*"):
        if path.is_file():
            target = destination / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)


def main() -> None:
    copy_assets()
    build_language("ru")
    build_language("en")
    (ROOT / ".nojekyll").touch()
    print("Сборка завершена")


if __name__ == "__main__":
    try:
        main()
    except (BuildError, OSError, tomllib.TOMLDecodeError) as error:
        raise SystemExit(f"Ошибка сборки: {error}") from error
