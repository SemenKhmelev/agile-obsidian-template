/**
 * Добавляет возможность сортировки для всех таблиц в документе по клику на заголовки столбцов.
 * Позволяет пользователям щелкать по заголовкам таблицы, чтобы отсортировать по выбранному столбцу.
 * Поддерживает как числовую, так и текстовую сортировку.
 * Показывает спиннер во время обработки таблицы.
 */
const addSortableTableFunctionality = () => {
    // Добавляем стили для спиннера
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .table-spinner-container {
            position: relative;
            min-height: 50px;
        }
        
        .table-spinner {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f5f6f8;
            border-top: 4px solid #4e9af3;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @media (prefers-color-scheme: dark) {
            .table-spinner {
                background-color: rgba(27, 27, 30, 1);  
            }

            .spinner {
                border: 4px solid #3a3a3d;
                border-top: 4px solid #4e9af3;
            }
        }
    
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .sort-indicator {
            margin-left: 5px;
            font-size: 0.9em;
        }
    `;
    document.head.appendChild(styleElement);

    // Найти все таблицы в документе и добавить спиннер
    const tables = document.querySelectorAll('.table-view-table');

    /**
     * Извлекает числовое значение из строки, содержащей HTML и возможный диапазон вида "число → число".
     *
     * @param {string} rawValue - Строка, содержащая HTML и/или значение вида "X → Y".
     * @returns {number} - Извлечённое финальное числовое значение, либо NaN, если не удалось разобрать.
     */
    const extractFinalNumber = (rawValue) => {
        if (!rawValue) return NaN;

        // Создаем временный элемент и парсим HTML
        const tmp = document.createElement('div');
        tmp.innerHTML = rawValue;
        const value = tmp.textContent || tmp.innerText || '';

        const parts = value.split('→').map(p => p.trim());
        let finalPart = parts[parts.length - 1];
        finalPart = finalPart.split('/')[0].trim();

        return parseFloat(finalPart.replace(/[^\d.-]/g, ''));
    };

    tables.forEach(table => {
        // Добавляем контейнер для спиннера
        const tableParent = table.parentElement;
        tableParent.classList.add('table-spinner-container');

        // Создаем и добавляем спиннер
        const spinnerContainer = document.createElement('div');
        spinnerContainer.className = 'table-spinner';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinnerContainer.appendChild(spinner);
        tableParent.appendChild(spinnerContainer);

        // Добавляем идентификатор для спиннера
        const spinnerId = 'spinner-' + Math.random().toString(36).substr(2, 9);
        spinnerContainer.id = spinnerId;

        // Добавляем сортировку с небольшой задержкой
        setTimeout(() => {
            const headers = table.querySelectorAll('thead th');

            // Добавить обработчики кликов ко всем заголовкам
            headers.forEach((header, index) => {
                // Пропустить, если индикатор сортировки уже добавлен
                if (header.querySelector('.sort-indicator')) return;

                // Добавить индикатор сортировки и сделать заголовок кликабельным
                const sortIndicator = document.createElement('span');
                sortIndicator.className = 'sort-indicator';
                sortIndicator.style.opacity = '0.5';
                header.appendChild(sortIndicator);

                // Проверяем, является ли текущий столбец "Spent" (уже отсортирован по умолчанию)
                const columnName = header.textContent.trim().toLowerCase();
                const isSpentColumn = columnName === 'spent';

                // Если это столбец "Spent", сразу устанавливаем сортировку по убыванию
                if (isSpentColumn) {
                    header.setAttribute('data-sort-direction', 'desc');
                    sortIndicator.innerHTML = ' ↓';
                    sortIndicator.style.opacity = '1';
                } else {
                    sortIndicator.innerHTML = ' ↕️';
                    header.setAttribute('data-sort-direction', 'none');
                }

                header.style.cursor = 'pointer';

                header.addEventListener('click', () => {
                    // Получить текущий порядок сортировки
                    const currentDirection = header.getAttribute('data-sort-direction') || 'none';

                    // Сбросить сортировку у всех заголовков
                    headers.forEach(h => {
                        const indicator = h.querySelector('.sort-indicator');
                        if (indicator) {
                            indicator.innerHTML = ' ↕️';
                            indicator.style.opacity = '0.5';
                            h.setAttribute('data-sort-direction', 'none');
                        }
                    });

                    // Установить новое направление сортировки
                    let newDirection = 'asc';
                    if (currentDirection === 'asc') {
                        newDirection = 'desc';
                        sortIndicator.innerHTML = ' ↓';
                    } else {
                        sortIndicator.innerHTML = ' ↑';
                    }
                    sortIndicator.style.opacity = '1';
                    header.setAttribute('data-sort-direction', newDirection);

                    // Выполнить сортировку таблицы
                    const tbody = table.querySelector('tbody');
                    const rows = Array.from(tbody.querySelectorAll('tr'));

                    rows.sort((a, b) => {
                        const aValue = a.querySelectorAll('td')[index].textContent;
                        const bValue = b.querySelectorAll('td')[index].textContent;

                        // Попробовать распарсить значения как числа
                        const aNum = extractFinalNumber(a.querySelectorAll("td")[index].innerHTML);
                        const bNum = extractFinalNumber(b.querySelectorAll("td")[index].innerHTML);

                        if (!isNaN(aNum) && !isNaN(bNum)) {
                            return newDirection === 'asc' ? aNum - bNum : bNum - aNum;
                        }

                        // Иначе сортировать как строки
                        return newDirection === 'asc'
                            ? aValue.localeCompare(bValue)
                            : bValue.localeCompare(aValue);
                    });

                    // Переставить строки в соответствии с сортировкой
                    rows.forEach(row => tbody.appendChild(row));
                });
            });

            // Удаляем спиннер после добавления сортировки
            const spinnerToRemove = document.getElementById(spinnerId);
            if (spinnerToRemove) {
                spinnerToRemove.remove();
            }
        }, 500); // Ждем, чтобы таблицы успели отрисоваться
    });
};

module.exports = addSortableTableFunctionality;
