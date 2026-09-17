# agile-obsidian landing page

Собрать сайт из корня ветки:

```sh
python3 _src/build.py
```

Генератор на Python 3.11+ без сторонних зависимостей создаёт `index.html`, `en/index.html`, копирует исходные CSS/JS и фавиконку в `assets/`, затем пишет `.nojekyll`.

Для публикации откройте **Settings → Pages** репозитория GitHub, выберите **Deploy from a branch**, ветку `gh-pages` и каталог `/ (root)`.
