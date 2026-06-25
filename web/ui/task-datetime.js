(function (root) {
    const REQUIRED_ERROR = 'Выберите срок задачи';
    const PAST_ERROR = 'Срок не может быть раньше текущего времени';
    const FORMAT_ERROR = 'Введите дату в формате ДД.ММ.ГГГГ ЧЧ:ММ';
    const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const MONTH_LABELS = [
        'Январь',
        'Февраль',
        'Март',
        'Апрель',
        'Май',
        'Июнь',
        'Июль',
        'Август',
        'Сентябрь',
        'Октябрь',
        'Ноябрь',
        'Декабрь',
    ];

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function isValidDate(value) {
        return value instanceof Date && !Number.isNaN(value.getTime());
    }

    function localDate(year, monthIndex, day, hours = 0, minutes = 0) {
        const date = new Date(0);
        date.setFullYear(year, monthIndex, day);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    function coerceDate(value) {
        if (!value) return null;
        if (value instanceof Date) return isValidDate(value) ? new Date(value.getTime()) : null;
        const date = new Date(value);
        return isValidDate(date) ? date : null;
    }

    function startOfDay(value) {
        const date = coerceDate(value);
        if (!date) return null;
        return localDate(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function startOfMinute(value) {
        const date = coerceDate(value);
        if (!date) return null;
        date.setSeconds(0, 0);
        return date;
    }

    function normalizeDateTime(value) {
        return startOfMinute(value);
    }

    function compareByMinute(left, right) {
        const leftDate = startOfMinute(left);
        const rightDate = startOfMinute(right);
        if (!leftDate || !rightDate) return Number.NaN;
        return leftDate.getTime() - rightDate.getTime();
    }

    function isSameDay(left, right) {
        const leftDate = coerceDate(left);
        const rightDate = coerceDate(right);
        return Boolean(
            leftDate &&
            rightDate &&
            leftDate.getFullYear() === rightDate.getFullYear() &&
            leftDate.getMonth() === rightDate.getMonth() &&
            leftDate.getDate() === rightDate.getDate()
        );
    }

    function addDays(value, amount) {
        const date = coerceDate(value);
        if (!date) return null;
        return localDate(date.getFullYear(), date.getMonth(), date.getDate() + amount, date.getHours(), date.getMinutes());
    }

    function dateKey(value) {
        const date = coerceDate(value);
        if (!date) return '';
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function parseDateKey(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const [, year, month, day] = match.map(Number);
        const date = localDate(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }
        return date;
    }

    function timeValue(value) {
        const date = coerceDate(value);
        if (!date) return '';
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function parseTimeValue(value) {
        const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return { hours, minutes };
    }

    function mergeDateAndTime(day, timeSource) {
        const dayDate = coerceDate(day);
        const source = coerceDate(timeSource) || defaultDueDate();
        if (!dayDate || !source) return null;
        return localDate(
            dayDate.getFullYear(),
            dayDate.getMonth(),
            dayDate.getDate(),
            source.getHours(),
            source.getMinutes()
        );
    }

    function defaultDueDate(now = new Date()) {
        const date = startOfMinute(now) || new Date();
        date.setHours(date.getHours() + 1);
        return date;
    }

    function parseDisplayDateTime(value) {
        const raw = String(value || '').trim().replace(/\s+/g, ' ');
        if (!raw) return { date: null, error: 'empty', message: REQUIRED_ERROR };

        const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
        if (!match) return { date: null, error: 'format', message: FORMAT_ERROR };

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const hours = Number(match[4]);
        const minutes = Number(match[5]);

        if (year < 1000 || month < 1 || month > 12 || day < 1 || hours > 23 || minutes > 59) {
            return { date: null, error: 'format', message: FORMAT_ERROR };
        }

        const date = localDate(year, month - 1, day, hours, minutes);
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day ||
            date.getHours() !== hours ||
            date.getMinutes() !== minutes
        ) {
            return { date: null, error: 'format', message: FORMAT_ERROR };
        }

        return { date, error: null, message: '' };
    }

    function formatDisplayDateTime(value) {
        const date = coerceDate(value);
        if (!date) return '';
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatPresetDetail(value) {
        const date = coerceDate(value);
        if (!date) return '';
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
        const detail = formatter.format(date);
        return detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : '';
    }

    function formatAriaDate(value) {
        const date = coerceDate(value);
        if (!date) return '';
        return new Intl.DateTimeFormat('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    }

    function monthTitle(value) {
        const date = coerceDate(value) || new Date();
        return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
    }

    function endOfWeekDate(now = new Date()) {
        const today = startOfDay(now);
        const mondayBasedDay = (today.getDay() + 6) % 7;
        return addDays(today, 4 - mondayBasedDay);
    }

    function endOfMonthDate(now = new Date()) {
        const date = coerceDate(now) || new Date();
        return localDate(date.getFullYear(), date.getMonth() + 1, 0);
    }

    function nextMonthEndDate(now = new Date()) {
        const date = coerceDate(now) || new Date();
        return localDate(date.getFullYear(), date.getMonth() + 2, 0);
    }

    function futurePresetDate(day, timeSource, now = new Date(), fallbackDays = 7) {
        const min = startOfMinute(now);
        let candidate = mergeDateAndTime(day, timeSource);
        if (!candidate || !min) return candidate;
        if (compareByMinute(candidate, min) >= 0) return candidate;
        if (isSameDay(candidate, min)) return min;
        return mergeDateAndTime(addDays(day, fallbackDays), timeSource);
    }

    function dueDatePresets(now = new Date(), selectedDate = null) {
        const min = startOfMinute(now);
        const timeSource = coerceDate(selectedDate) || defaultDueDate(now);
        const today = startOfDay(now);
        const tomorrow = addDays(today, 1);
        const weekEnd = endOfWeekDate(now);
        const monthEnd = endOfMonthDate(now);
        const resolvedWeekEnd = futurePresetDate(weekEnd, timeSource, now, 7);
        const resolvedMonthEnd = compareByMinute(mergeDateAndTime(monthEnd, timeSource), min) >= 0
            ? mergeDateAndTime(monthEnd, timeSource)
            : mergeDateAndTime(nextMonthEndDate(now), timeSource);

        const values = [
            ['today', 'Сегодня', futurePresetDate(today, timeSource, now, 1)],
            ['tomorrow', 'Завтра', mergeDateAndTime(tomorrow, timeSource)],
            ['week-end', 'В конце недели', resolvedWeekEnd],
            ['next-week', 'Через неделю', mergeDateAndTime(addDays(today, 7), timeSource)],
            ['month-end', 'В конце месяца', resolvedMonthEnd],
        ];

        return values
            .filter(([, , date]) => isValidDate(date))
            .map(([id, title, date]) => ({
                id,
                title,
                date,
                key: dateKey(date),
                detail: formatPresetDetail(date),
            }));
    }

    function calendarDays(viewDate, selectedDate = null, now = new Date()) {
        const view = coerceDate(viewDate) || new Date();
        const firstOfMonth = localDate(view.getFullYear(), view.getMonth(), 1);
        const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
        const gridStart = addDays(firstOfMonth, -mondayOffset);
        const today = startOfDay(now);

        return Array.from({ length: 42 }, (_, index) => {
            const date = addDays(gridStart, index);
            const disabled = startOfDay(date).getTime() < today.getTime();
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            return {
                date,
                key: dateKey(date),
                label: date.getDate(),
                outside: date.getMonth() !== view.getMonth(),
                disabled,
                weekend,
                today: isSameDay(date, now),
                selected: selectedDate ? isSameDay(date, selectedDate) : false,
                ariaLabel: formatAriaDate(date),
            };
        });
    }

    function validateDueDate(value, options = {}) {
        const { now = new Date(), required = true } = options;
        let date = null;
        let parseResult = { error: null, message: '' };

        if (value instanceof Date) {
            date = normalizeDateTime(value);
        } else {
            parseResult = parseDisplayDateTime(value);
            date = parseResult.date;
        }

        if (!date) {
            if (parseResult.error === 'empty' && !required) {
                return { valid: true, date: null, message: '', reason: null };
            }
            const message = parseResult.error === 'empty' ? REQUIRED_ERROR : FORMAT_ERROR;
            return { valid: false, date: null, message, reason: parseResult.error || 'format' };
        }

        if (compareByMinute(date, now) < 0) {
            return { valid: false, date, message: PAST_ERROR, reason: 'past' };
        }

        return { valid: true, date, message: '', reason: null };
    }

    const api = {
        REQUIRED_ERROR,
        PAST_ERROR,
        FORMAT_ERROR,
        WEEKDAY_LABELS,
        addDays,
        calendarDays,
        compareByMinute,
        dateKey,
        defaultDueDate,
        dueDatePresets,
        formatAriaDate,
        formatDisplayDateTime,
        formatPresetDetail,
        isSameDay,
        mergeDateAndTime,
        monthTitle,
        normalizeDateTime,
        parseDateKey,
        parseDisplayDateTime,
        parseTimeValue,
        startOfDay,
        startOfMinute,
        timeValue,
        validateDueDate,
    };

    root.PulseDeskDateTime = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
