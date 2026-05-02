class ProductivityDashboard {
    constructor() {
        this.routes = {
            dashboard: '/dashboard',
            tasks: '/tasks',
            calendar: '/calendar',
            habits: '/habits',
            sleep: '/sleep',
            profile: '/profile',
            admin: '/admin',
        };
        this.currentPage = this.pageFromPath(window.location.pathname);
        this.currentFilter = 'all';
        this.currentUser = null;
        this.preferences = this.defaultPreferences();
        this.editingTask = null;
        this.editingHabit = null;
        this.editingSleepLog = null;
        this.searchTimer = null;
        this.clockTimer = null;
        this.notificationTimer = null;
        this.pomodoroTimer = null;
        this.pomodoroRemaining = 0;
        this.pomodoroTaskID = null;
        this.originalTitle = document.title;
        this.sidebarTouchStartX = 0;
        this.confirmResolver = null;
        this.init();
    }

    async init() {
        this.applyPreferences(this.loadLocalPreferences(), false);

        if (!localStorage.getItem('token')) {
            this.redirectToAuth();
            return;
        }

        this.bindEvents();
        this.registerServiceWorker();
        this.startClock();
        this.startTaskNotifications();
        this.setDefaultSleepInputs();
        this.setTaskDateBounds();

        try {
            this.currentUser = await this.request('/api/auth/me');
            localStorage.setItem('user', JSON.stringify(this.currentUser));
            await this.loadPreferences();
            this.updateUserInterface();
            this.showPage(this.pageFromPath(window.location.pathname), { replace: true });
            document.body.classList.remove('app-booting');
            document.body.classList.add('app-ready');
            await this.loadAll();
        } catch (error) {
            this.redirectToAuth();
        }
    }

    bindEvents() {
        document.querySelectorAll('[data-page]').forEach((button) => {
            button.addEventListener('click', () => this.showPage(button.dataset.page));
        });

        document.querySelectorAll('[data-page-jump]').forEach((button) => {
            button.addEventListener('click', () => this.showPage(button.dataset.pageJump));
        });

        document.getElementById('mobileMenuButton')?.addEventListener('click', () => this.openSidebar());
        document.getElementById('sidebarCloseButton')?.addEventListener('click', () => this.closeSidebar());
        document.getElementById('sidebarBackdrop')?.addEventListener('click', () => this.closeSidebar());
        document.getElementById('sidebar')?.addEventListener('touchstart', (event) => {
            this.sidebarTouchStartX = event.changedTouches?.[0]?.clientX || 0;
        }, { passive: true });
        document.getElementById('sidebar')?.addEventListener('touchend', (event) => {
            const endX = event.changedTouches?.[0]?.clientX || 0;
            if (this.sidebarTouchStartX - endX > 70) {
                this.closeSidebar();
            }
        }, { passive: true });

        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('mobileThemeToggle')?.addEventListener('click', () => this.toggleTheme());

        document.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.addEventListener('click', () => this.setTheme(button.dataset.themeChoice));
        });

        document.querySelectorAll('[data-preference]').forEach((button) => {
            button.addEventListener('click', () => this.handlePreferenceClick(button));
        });

        document.getElementById('sidebarLogout')?.addEventListener('click', () => this.logout());
        document.getElementById('profileLogout')?.addEventListener('click', () => this.logout());

        document.getElementById('addTaskButton')?.addEventListener('click', () => this.openTaskModal());
        document.getElementById('taskForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveTask();
        });
        document.getElementById('addSubtaskButton')?.addEventListener('click', () => this.addSubtaskEditorRow());
        document.querySelectorAll('[data-priority-choice]').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById('taskPriority').value = button.dataset.priorityChoice;
                this.syncPriorityChoice();
            });
        });

        document.getElementById('addHabitButton')?.addEventListener('click', () => this.openHabitModal());
        document.getElementById('habitForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveHabit();
        });

        document.querySelectorAll('[data-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                this.currentFilter = button.dataset.filter;
                document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                this.loadTasks();
            });
        });

        document.getElementById('taskSearch')?.addEventListener('input', () => {
            window.clearTimeout(this.searchTimer);
            this.searchTimer = window.setTimeout(() => this.loadTasks(), 250);
        });

        document.getElementById('sleepSettingsForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveSleepSettings();
        });
        document.getElementById('toggleSleepSettings')?.addEventListener('click', () => {
            document.querySelector('.sleep-settings-card')?.classList.toggle('editing');
        });

        document.getElementById('sleepLogForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveSleepLog();
        });
        document.querySelectorAll('[data-sleep-quality]').forEach((button) => {
            button.addEventListener('click', () => this.setSleepQuality(button.dataset.sleepQuality));
        });

        document.getElementById('cancelSleepEdit')?.addEventListener('click', () => this.cancelSleepEdit());

        document.getElementById('profileNameForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveProfileName();
        });

        document.getElementById('profilePasswordForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.savePassword();
        });

        document.getElementById('refreshAdminButton')?.addEventListener('click', () => this.loadAdmin());
        document.getElementById('adminUserSearch')?.addEventListener('input', () => this.renderAdminUsers());
        document.getElementById('adminRoleFilter')?.addEventListener('change', () => this.renderAdminUsers());
        document.getElementById('adminStatusFilter')?.addEventListener('change', () => this.renderAdminUsers());

        document.querySelectorAll('[data-close-modal]').forEach((button) => {
            button.addEventListener('click', () => this.closeModal(false));
        });

        document.getElementById('modalLayer')?.addEventListener('click', (event) => {
            if (event.target.id === 'modalLayer') {
                this.closeModal(false);
            }
        });

        document.getElementById('confirmAction')?.addEventListener('click', () => this.closeModal(true));

        document.addEventListener('click', (event) => this.handleActionClick(event));
        document.addEventListener('change', (event) => {
            const select = event.target.closest('[data-action="admin-role"]');
            if (select) {
                this.updateAdminRole(select.dataset.id, select.value);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeSidebar();
                this.closeModal(false);
            }
        });

        window.addEventListener('popstate', () => {
            this.showPage(this.pageFromPath(window.location.pathname), { history: false });
        });
    }

    openSidebar() {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('sidebarBackdrop')?.classList.add('active');
        document.body.classList.add('sidebar-open');
    }

    closeSidebar() {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarBackdrop')?.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    async request(path, options = {}) {
        return this.apiFetch(path, options);
    }

    apiFetch(path, options = {}) {
        return window.PulseDeskAPI.apiFetch(path, options);
    }

    async loadAll() {
        this.showSkeletons();
        await Promise.all([
            this.loadStats(),
            this.loadTasks(),
            this.loadHabits(),
            this.loadSleep(),
        ]);
        await this.loadDashboard();
    }

    startClock() {
        this.renderClock();
        if (this.clockTimer) {
            clearInterval(this.clockTimer);
        }
        this.clockTimer = setInterval(() => this.renderClock(), 30000);
    }

    renderClock() {
        const now = new Date();
        this.setText('currentTime', new Intl.DateTimeFormat('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        }).format(now));
        this.setText('currentDate', new Intl.DateTimeFormat('ru-RU', {
            weekday: 'short',
            day: '2-digit',
            month: 'long',
        }).format(now));
    }

    startTaskNotifications() {
        if (this.notificationTimer) {
            clearInterval(this.notificationTimer);
        }
        this.notificationTimer = setInterval(() => this.checkTaskDeadlines(), 30000);
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            return;
        }
        navigator.serviceWorker.register('/sw.js').catch(() => {});
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'navigate' && event.data.page) {
                this.showPage(event.data.page);
            }
        });
    }

    async ensureNotificationPermission() {
        if (!('Notification' in window)) {
            return false;
        }
        if (Notification.permission === 'granted') {
            return true;
        }
        if (Notification.permission === 'denied') {
            return false;
        }
        try {
            return (await Notification.requestPermission()) === 'granted';
        } catch (error) {
            return false;
        }
    }

    notificationKey(task) {
        return `pulsedesk-task-reminder:${task.id}:${task.due_date}`;
    }

    checkTaskDeadlines() {
        if (!('Notification' in window) || Notification.permission !== 'granted' || !Array.isArray(this.tasks)) {
            return;
        }

        const now = Date.now();
        const reminderWindowStart = 9.5 * 60 * 1000;
        const reminderWindowEnd = 10.5 * 60 * 1000;

        this.tasks.forEach((task) => {
            if (task.completed || !task.due_date) return;
            const dueAt = new Date(task.due_date).getTime();
            if (Number.isNaN(dueAt)) return;
            const timeLeft = dueAt - now;
            if (timeLeft < reminderWindowStart || timeLeft > reminderWindowEnd) return;

            const key = this.notificationKey(task);
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, new Date().toISOString());

            this.showTaskNotification(key, task);
        });
    }

    async showTaskNotification(key, task) {
        const body = `${task.title} · срок ${this.formatDateTime(task.due_date)}`;
        const registration = await navigator.serviceWorker?.ready.catch(() => null);
        if (registration?.showNotification) {
            registration.showNotification('PulseDesk: задача скоро истекает', {
                body,
                tag: key,
                data: { url: '/tasks', page: 'tasks' },
            });
            return;
        }

        const notification = new Notification('PulseDesk: задача скоро истекает', { body, tag: key });
        notification.onclick = () => {
            window.focus();
            this.showPage('tasks');
            notification.close();
        };
    }

    async loadPageData() {
        if (this.currentPage === 'dashboard') {
            await this.loadDashboard();
        }
        if (this.currentPage === 'tasks') {
            await this.loadTasks();
        }
        if (this.currentPage === 'calendar') {
            await this.loadCalendar();
        }
        if (this.currentPage === 'habits') {
            await this.loadHabits();
        }
        if (this.currentPage === 'sleep') {
            await this.loadSleep();
        }
        if (this.currentPage === 'admin') {
            await this.loadAdmin();
        }
    }

    pageFromPath(pathname) {
        const cleanPath = String(pathname || '').replace(/\/$/, '') || '/';
        if (cleanPath === '/app') {
            return 'dashboard';
        }
        const match = Object.entries(this.routes).find(([, path]) => path === cleanPath);
        return match?.[0] || 'dashboard';
    }

    pathForPage(page) {
        return this.routes[page] || '/dashboard';
    }

    syncRoute(page, options = {}) {
        if (window.location.protocol === 'file:') return;
        const target = this.pathForPage(page);
        if (window.location.pathname === target) return;
        const state = { page };
        if (options.replace) {
            window.history.replaceState(state, '', target);
        } else if (options.history !== false) {
            window.history.pushState(state, '', target);
        }
    }

    showPage(page, options = {}) {
        if (page === 'admin' && this.currentUser?.role !== 'admin') {
            this.toast('Доступ только для администратора', 'error');
            page = 'dashboard';
        }
        this.syncRoute(page, options);
        this.currentPage = page;
        document.querySelectorAll('.page').forEach((section) => {
            section.classList.toggle('active', section.id === `${page}-page`);
        });
        document.querySelectorAll('.nav-link, .bottom-link').forEach((button) => {
            button.classList.toggle('active', button.dataset.page === page);
        });
        this.closeSidebar();
        if (document.body.classList.contains('app-ready')) {
            window.scrollTo({ top: 0, behavior: this.preferences.motion === 'reduced' ? 'auto' : 'smooth' });
        }
        this.loadPageData();
    }

    showSkeletons() {
        ['dashboardTasks', 'dashboardHabits', 'tasksList', 'habitsList', 'sleepLogsList'].forEach((id) => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton-row"></div>').join('');
            }
        });
    }

    async loadStats() {
        try {
            const stats = await this.request('/api/stats');
            this.stats = stats;
            this.renderStats();
        } catch (error) {
            this.toast('Не удалось загрузить статистику', 'error');
        }
    }

    renderStats() {
        const stats = this.stats || {};
        this.setText('totalTasks', stats.total_tasks || 0);
        this.setText('completedTasks', stats.completed_today || 0);
        this.setText('bestStreak', stats.best_streak || 0);
        this.renderProductivityScore();
    }

    async loadDashboard() {
        try {
            const [tasks, habits] = await Promise.all([
                this.request('/api/tasks?status=today'),
                this.request('/api/habits'),
            ]);
            this.renderDashboardTasks(tasks || []);
            this.renderDashboardHabits((habits || []).slice(0, 5));
            this.renderProductivityScore();
        } catch (error) {
            this.toast('Не удалось обновить dashboard', 'error');
        }
    }

    renderDashboardTasks(tasks) {
        const container = document.getElementById('dashboardTasks');
        if (!container) return;
        if (!tasks.length) {
            container.innerHTML = this.emptyState('fa-clipboard-check', 'На сегодня задач нет', 'Можно добавить новую задачу или перейти к привычкам.');
            return;
        }
        container.innerHTML = `
            <div class="dashboard-table">
                ${tasks.slice(0, 5).map((task) => this.dashboardTaskRow(task)).join('')}
            </div>
        `;
    }

    renderDashboardHabits(habits) {
        const container = document.getElementById('dashboardHabits');
        if (!container) return;
        if (!habits.length) {
            container.innerHTML = this.emptyState('fa-repeat', 'Привычек пока нет', 'Создайте первый ежедневный ритуал.');
            return;
        }
        container.innerHTML = `
            <div class="dashboard-table">
                ${habits.map((habit) => this.dashboardHabitRow(habit)).join('')}
            </div>
        `;
    }

    renderProductivityScore() {
        const taskScore = this.stats?.productivity_score ?? 0;
        const hasSleepData = Boolean(this.sleepStats?.days_logged);
        const sleepScore = hasSleepData ? this.sleepScore(this.sleepStats) : null;
        const score = sleepScore === null ? taskScore : Math.round((taskScore + sleepScore) / 2);
        const clamped = Math.max(0, Math.min(100, score));
        const circle = document.getElementById('scoreRing');
        const circumference = 2 * Math.PI * 52;

        this.setText('productivityScore', `${clamped}%`);
        this.setText('scoreCaption', clamped >= 75 ? 'День идёт уверенно' : clamped >= 45 ? 'Нормальный темп, есть запас' : 'Начните с одного короткого действия');
        this.setText('scoreBreakdown', sleepScore === null
            ? `Задачи ${Math.round(taskScore)}% · сон пока без записей`
            : `Задачи ${Math.round(taskScore)}% · сон ${sleepScore}% · среднее ${clamped}%`);
        if (circle) {
            circle.style.strokeDasharray = `${circumference}`;
            circle.style.strokeDashoffset = `${circumference - (clamped / 100) * circumference}`;
        }
    }

    dashboardTaskRow(task) {
        const priorityText = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[task.priority] || 'Средний';
        const due = task.due_date ? this.formatDateTime(task.due_date) : 'без срока';
        return `
            <article class="dashboard-row task-dashboard-row ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <button class="check-button mini ${task.completed ? 'checked' : ''}" type="button" data-action="task-toggle" data-id="${task.id}" aria-label="Изменить статус задачи">
                    <i class="fas fa-check" aria-hidden="true"></i>
                </button>
                <div class="dashboard-cell main-cell">
                    <strong>${this.escape(task.title)}</strong>
                    ${task.description ? `<small>${this.escape(task.description)}</small>` : ''}
                </div>
                <div class="dashboard-cell"><span class="priority priority-${task.priority}">${priorityText}</span></div>
                <div class="dashboard-cell muted-cell"><i class="fas fa-calendar" aria-hidden="true"></i> ${due}</div>
            </article>
        `;
    }

    dashboardHabitRow(habit) {
        const color = this.safeColor(habit.color);
        return `
            <article class="dashboard-row habit-dashboard-row" data-id="${habit.id}">
                <span class="habit-dot" style="--habit-color: ${color}"></span>
                <div class="dashboard-cell main-cell">
                    <strong>${this.escape(habit.title)}</strong>
                    ${habit.description ? `<small>${this.escape(habit.description)}</small>` : ''}
                </div>
                <div class="dashboard-cell muted-cell"><i class="fas fa-fire" aria-hidden="true"></i> ${habit.streak || 0} дней</div>
                <div class="dashboard-cell muted-cell">${Math.round(habit.weekly_rate || 0)}% за неделю</div>
                <button class="btn ${habit.checked_today ? 'btn-secondary' : 'btn-primary'} compact-btn" type="button" data-action="habit-toggle" data-id="${habit.id}">
                    ${habit.checked_today ? 'Отмечено' : 'Отметить'}
                </button>
            </article>
        `;
    }

    sleepScore(stats) {
        if (!stats || !stats.days_logged) return 0;
        const durationRatio = stats.target_duration_minutes
            ? Math.min(stats.average_duration_minutes / stats.target_duration_minutes, 1)
            : 0;
        const complianceRatio = Math.min(stats.compliant_days / 7, 1);
        return Math.round(durationRatio * 70 + complianceRatio * 30);
    }

    async loadTasks() {
        const params = new URLSearchParams();
        if (this.currentFilter !== 'all') {
            params.set('status', this.currentFilter);
        }
        const search = document.getElementById('taskSearch')?.value.trim();
        if (search) {
            params.set('search', search);
        }

        try {
            const tasks = await this.request(`/api/tasks${params.toString() ? `?${params}` : ''}`);
            this.tasks = tasks || [];
            this.renderTasks();
            this.renderCalendar();
            this.checkTaskDeadlines();
        } catch (error) {
            this.toast('Не удалось загрузить задачи', 'error');
        }
    }

    async loadCalendar() {
        try {
            const tasks = await this.request('/api/tasks');
            this.tasks = tasks || [];
            this.renderCalendar();
            this.checkTaskDeadlines();
        } catch (error) {
            this.toast('Не удалось загрузить календарь', 'error');
        }
    }

    renderCalendar() {
        const container = document.getElementById('calendarGrid');
        if (!container) return;
        const tasks = (this.tasks || []).filter((task) => task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days = Array.from({ length: 14 }, (_, index) => {
            const day = new Date(today);
            day.setDate(today.getDate() + index);
            return day;
        });

        container.innerHTML = days.map((day) => {
            const key = this.dateInputValue(day);
            const dayTasks = tasks.filter((task) => this.dateInputValue(new Date(task.due_date)) === key)
                .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
            return `
                <article class="calendar-day ${key === this.todayDateValue() ? 'today' : ''}">
                    <div class="calendar-day-head">
                        <strong>${new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(day)}</strong>
                        <span>${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(day)}</span>
                    </div>
                    <div class="calendar-task-list">
                        ${dayTasks.length ? dayTasks.map((task) => `
                            <button class="calendar-task ${task.completed ? 'completed' : ''}" type="button" data-action="task-edit" data-id="${task.id}">
                                <span>${this.timeOnly(task.due_date)}</span>
                                <strong>${this.escape(task.title)}</strong>
                            </button>
                        `).join('') : '<p>Свободно</p>'}
                    </div>
                </article>
            `;
        }).join('');
    }

    renderTasks() {
        const container = document.getElementById('tasksList');
        if (!container) return;
        if (!this.tasks?.length) {
            container.innerHTML = this.emptyState('fa-list-check', 'Задач нет', 'Создайте задачу, чтобы зафиксировать следующий шаг.');
            return;
        }
        container.innerHTML = this.tasks.map((task) => this.taskTemplate(task)).join('');
        this.bindTaskDrag();
    }

    taskTemplate(task, compact = false) {
        const priorityText = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[task.priority] || 'Средний';
        const due = task.due_date ? this.formatDateTime(task.due_date) : '';
        const completed = task.completed ? 'completed' : '';
        const recurrenceText = { daily: 'ежедневно', weekly: 'еженедельно', monthly: 'ежемесячно' }[task.recurrence] || '';
        const subtasks = task.subtasks || [];
        const doneSubtasks = subtasks.filter((item) => item.completed).length;
        return `
            <article class="list-item task-card ${completed}" data-id="${task.id}" draggable="${compact ? 'false' : 'true'}">
                <button class="check-button ${task.completed ? 'checked' : ''}" type="button" data-action="task-toggle" data-id="${task.id}" aria-label="Изменить статус задачи">
                    <i class="fas fa-check" aria-hidden="true"></i>
                </button>
                <div class="item-body">
                    <h3>${this.escape(task.title)}</h3>
                    ${task.description && !compact ? `<p>${this.escape(task.description)}</p>` : ''}
                    <div class="item-meta">
                        <span class="priority priority-${task.priority}">${priorityText}</span>
                        ${due ? `<span><i class="fas fa-calendar" aria-hidden="true"></i> ${due}</span>` : ''}
                        ${recurrenceText ? `<span><i class="fas fa-repeat" aria-hidden="true"></i> ${recurrenceText}</span>` : ''}
                        ${subtasks.length ? `<span><i class="fas fa-square-check" aria-hidden="true"></i> ${doneSubtasks}/${subtasks.length}</span>` : ''}
                    </div>
                    ${subtasks.length && !compact ? `
                        <div class="subtask-list">
                            ${subtasks.map((subtask) => `
                                <label class="subtask-item ${subtask.completed ? 'done' : ''}">
                                    <input type="checkbox" ${subtask.completed ? 'checked' : ''} data-action="subtask-toggle" data-id="${task.id}" data-subtask-id="${subtask.id}">
                                    <span>${this.escape(subtask.title)}</span>
                                </label>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                ${compact ? '' : `
                    <div class="item-actions">
                        <button class="icon-button" type="button" data-action="task-pomodoro" data-id="${task.id}" aria-label="Запустить Pomodoro"><i class="fas fa-hourglass-half" aria-hidden="true"></i></button>
                        <button class="icon-button" type="button" data-action="task-edit" data-id="${task.id}" aria-label="Редактировать задачу"><i class="fas fa-pen" aria-hidden="true"></i></button>
                        <button class="icon-button danger" type="button" data-action="task-delete" data-id="${task.id}" aria-label="Удалить задачу"><i class="fas fa-trash" aria-hidden="true"></i></button>
                    </div>
                `}
            </article>
        `;
    }

    openTaskModal(task = null) {
        this.editingTask = task;
        this.setText('taskModalTitle', task ? 'Редактировать задачу' : 'Новая задача');
        this.setTaskDateBounds();
        document.getElementById('taskTitle').value = task?.title || '';
        document.getElementById('taskDescription').value = task?.description || '';
        document.getElementById('taskPriority').value = task?.priority || 'medium';
        document.getElementById('taskDueDate').value = this.taskDateValue(task?.due_date);
        document.getElementById('taskRecurrence').value = task?.recurrence || 'none';
        this.setFormMessage('taskTitleError', '');
        this.syncPriorityChoice();
        this.renderSubtaskEditor(task?.subtasks || []);
        this.openModal('taskModal');
    }

    renderSubtaskEditor(subtasks = []) {
        const container = document.getElementById('subtaskEditorList');
        if (!container) return;
        container.innerHTML = '';
        if (!subtasks.length) {
            container.innerHTML = '<p class="checklist-empty">Добавьте шаги, чтобы разбить задачу на части.</p>';
            return;
        }
        subtasks.forEach((subtask) => this.addSubtaskEditorRow(subtask));
    }

    addSubtaskEditorRow(subtask = {}) {
        const container = document.getElementById('subtaskEditorList');
        if (!container) return;
        container.querySelector('.checklist-empty')?.remove();
        const row = document.createElement('div');
        row.className = 'subtask-editor-row';
        row.innerHTML = `
            <input type="checkbox" ${subtask.completed ? 'checked' : ''} aria-label="Пункт выполнен">
            <input type="text" maxlength="255" value="${this.escape(subtask.title || '')}" placeholder="Пункт чеклиста">
            <button class="icon-button" type="button" aria-label="Удалить пункт"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        `;
        row.querySelector('button').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    syncPriorityChoice() {
        const value = document.getElementById('taskPriority')?.value || 'medium';
        document.querySelectorAll('[data-priority-choice]').forEach((button) => {
            button.classList.toggle('active', button.dataset.priorityChoice === value);
        });
    }

    readSubtaskEditor() {
        return Array.from(document.querySelectorAll('#subtaskEditorList .subtask-editor-row'))
            .map((row, index) => ({
                title: row.querySelector('input[type="text"]').value.trim(),
                completed: row.querySelector('input[type="checkbox"]').checked,
                sort_order: index,
            }))
            .filter((subtask) => subtask.title);
    }

    async saveTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            this.setFormMessage('taskTitleError', 'Название обязательно', 'error');
            this.toast('Введите название задачи', 'error');
            return;
        }
        this.setFormMessage('taskTitleError', '');

        const dueValue = document.getElementById('taskDueDate').value;
        const dueDate = dueValue ? new Date(dueValue) : null;
        if (dueDate && dueDate.getTime() < Date.now()) {
            this.toast('Срок задачи не может быть в прошлом', 'error');
            return;
        }
        if (dueDate) {
            await this.ensureNotificationPermission();
        }
        const payload = {
            title,
            description: document.getElementById('taskDescription').value.trim(),
            priority: document.getElementById('taskPriority').value,
            recurrence: document.getElementById('taskRecurrence').value,
            subtasks: this.readSubtaskEditor(),
            due_date: dueDate ? dueDate.toISOString() : null,
        };

        const button = document.getElementById('taskSubmitButton');
        this.setLoading(button, true);
        try {
            const wasEditing = Boolean(this.editingTask);
            if (this.editingTask) {
                await this.request(`/api/tasks/${this.editingTask.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await this.request('/api/tasks', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            this.closeModal();
            this.toast(wasEditing ? 'Задача обновлена' : 'Задача создана', 'success');
            await Promise.all([this.loadStats(), this.loadTasks(), this.loadDashboard()]);
            this.checkTaskDeadlines();
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async toggleTask(id) {
        try {
            await this.request(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
            await Promise.all([this.loadStats(), this.loadTasks(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async editTask(id) {
        try {
            const task = await this.request(`/api/tasks/${id}`);
            this.openTaskModal(task);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async deleteTask(id) {
        if (!(await this.confirm('Удалить задачу?'))) return;
        try {
            await this.request(`/api/tasks/${id}`, { method: 'DELETE' });
            this.toast('Задача удалена', 'success');
            await Promise.all([this.loadStats(), this.loadTasks(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        } finally {
            this.setLoading(button, false);
        }
    }

    async toggleSubtask(taskID, subtaskID) {
        try {
            await this.request(`/api/tasks/${taskID}/subtasks/${subtaskID}/toggle`, { method: 'PATCH' });
            await Promise.all([this.loadTasks(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    bindTaskDrag() {
        const list = document.getElementById('tasksList');
        if (!list) return;

        list.querySelectorAll('.task-card').forEach((item) => {
            item.addEventListener('dragstart', () => item.classList.add('dragging'));
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.saveTaskOrder();
            });
        });

        list.addEventListener('dragover', (event) => {
            event.preventDefault();
            const dragging = list.querySelector('.dragging');
            if (!dragging) return;
            const after = this.getDragAfterElement(list, event.clientY);
            if (after) {
                list.insertBefore(dragging, after);
            } else {
                list.appendChild(dragging);
            }
        });
    }

    getDragAfterElement(container, y) {
        const items = [...container.querySelectorAll('.task-card:not(.dragging)')];
        return items.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async saveTaskOrder() {
        if (this.currentFilter !== 'all') {
            return;
        }
        const ids = Array.from(document.querySelectorAll('#tasksList .task-card'))
            .map((item) => Number(item.dataset.id))
            .filter(Boolean);
        if (!ids.length) return;
        try {
            await this.request('/api/tasks/reorder', {
                method: 'PATCH',
                body: JSON.stringify({ ids }),
            });
        } catch (error) {
            this.toast('Не удалось сохранить порядок задач', 'error');
        }
    }

    startPomodoro(id) {
        const task = this.tasks?.find((item) => String(item.id) === String(id));
        if (!task) return;
        if (this.pomodoroTimer) {
            clearInterval(this.pomodoroTimer);
        }
        this.pomodoroTaskID = task.id;
        this.pomodoroRemaining = 25 * 60;
        this.toast(`Pomodoro запущен: ${task.title}`, 'info');
        this.renderPomodoroTick(task.title);
        this.pomodoroTimer = setInterval(() => {
            this.pomodoroRemaining -= 1;
            this.renderPomodoroTick(task.title);
            if (this.pomodoroRemaining <= 0) {
                clearInterval(this.pomodoroTimer);
                this.pomodoroTimer = null;
                document.title = this.originalTitle;
                this.toast(`Pomodoro завершён: ${task.title}`, 'success');
                this.showPomodoroNotification(task);
            }
        }, 1000);
    }

    renderPomodoroTick(title) {
        const minutes = Math.floor(this.pomodoroRemaining / 60);
        const seconds = this.pomodoroRemaining % 60;
        document.title = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} · ${title}`;
    }

    async showPomodoroNotification(task) {
        await this.ensureNotificationPermission();
        const registration = await navigator.serviceWorker?.ready.catch(() => null);
        if (registration?.showNotification) {
            registration.showNotification('PulseDesk: Pomodoro завершён', {
                body: task.title,
                tag: `pulsedesk-pomodoro-${task.id}`,
                data: { url: '/app', page: 'tasks' },
            });
        }
    }

    async loadHabits() {
        try {
            const habits = await this.request('/api/habits');
            this.habits = habits || [];
            this.renderHabits();
        } catch (error) {
            this.toast('Не удалось загрузить привычки', 'error');
        }
    }

    renderHabits() {
        const container = document.getElementById('habitsList');
        if (!container) return;
        if (!this.habits?.length) {
            container.innerHTML = this.emptyState('fa-seedling', 'Привычек нет', 'Добавьте действие, которое хотите закрепить.');
            return;
        }
        container.innerHTML = this.habits.map((habit) => this.habitTemplate(habit)).join('');
    }

    habitTemplate(habit, compact = false) {
        const color = this.safeColor(habit.color);
        return `
            <article class="list-item" data-id="${habit.id}">
                <span class="habit-dot" style="--habit-color: ${color}"></span>
                <div class="item-body">
                    <h3>${this.escape(habit.title)}</h3>
                    ${habit.description && !compact ? `<p>${this.escape(habit.description)}</p>` : ''}
                    <div class="item-meta">
                        <span><i class="fas fa-fire" aria-hidden="true"></i> ${habit.streak || 0} дней</span>
                        <span>${Math.round(habit.weekly_rate || 0)}% за неделю</span>
                    </div>
                </div>
                <button class="btn ${habit.checked_today ? 'btn-secondary' : 'btn-primary'} compact-btn" type="button" data-action="habit-toggle" data-id="${habit.id}">
                    ${habit.checked_today ? 'Отмечено' : 'Отметить'}
                </button>
                ${compact ? '' : `
                    <div class="item-actions">
                        <button class="icon-button" type="button" data-action="habit-edit" data-id="${habit.id}" aria-label="Редактировать привычку"><i class="fas fa-pen" aria-hidden="true"></i></button>
                        <button class="icon-button danger" type="button" data-action="habit-delete" data-id="${habit.id}" aria-label="Удалить привычку"><i class="fas fa-trash" aria-hidden="true"></i></button>
                    </div>
                `}
            </article>
        `;
    }

    openHabitModal(habit = null) {
        this.editingHabit = habit;
        this.setText('habitModalTitle', habit ? 'Редактировать привычку' : 'Новая привычка');
        document.getElementById('habitTitle').value = habit?.title || '';
        document.getElementById('habitDescription').value = habit?.description || '';
        document.getElementById('habitColor').value = this.safeColor(habit?.color || '#4f46e5');
        this.setFormMessage('habitTitleError', '');
        this.openModal('habitModal');
    }

    async saveHabit() {
        const title = document.getElementById('habitTitle').value.trim();
        if (!title) {
            this.setFormMessage('habitTitleError', 'Название обязательно', 'error');
            this.toast('Введите название привычки', 'error');
            return;
        }
        this.setFormMessage('habitTitleError', '');

        const payload = {
            title,
            description: document.getElementById('habitDescription').value.trim(),
            color: document.getElementById('habitColor').value,
        };

        const button = document.getElementById('habitSubmitButton');
        this.setLoading(button, true);
        try {
            const wasEditing = Boolean(this.editingHabit);
            if (this.editingHabit) {
                await this.request(`/api/habits/${this.editingHabit.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await this.request('/api/habits', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            this.closeModal();
            this.toast(wasEditing ? 'Привычка обновлена' : 'Привычка создана', 'success');
            await Promise.all([this.loadStats(), this.loadHabits(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async toggleHabit(id) {
        try {
            await this.request(`/api/habits/${id}/check`, { method: 'PATCH' });
            await Promise.all([this.loadStats(), this.loadHabits(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async editHabit(id) {
        try {
            const habit = await this.request(`/api/habits/${id}`);
            this.openHabitModal(habit);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async deleteHabit(id) {
        if (!(await this.confirm('Удалить привычку?'))) return;
        try {
            await this.request(`/api/habits/${id}`, { method: 'DELETE' });
            this.toast('Привычка удалена', 'success');
            await Promise.all([this.loadStats(), this.loadHabits(), this.loadDashboard()]);
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async loadSleep() {
        try {
            const [settings, logs, stats] = await Promise.all([
                this.request('/api/sleep/settings'),
                this.request('/api/sleep/logs'),
                this.request('/api/sleep/stats'),
            ]);
            this.sleepSettings = settings;
            this.sleepLogs = logs || [];
            this.sleepStats = stats;
            this.renderSleepSettings();
            this.renderSleepStats();
            this.renderSleepLogs();
            this.renderProductivityScore();
        } catch (error) {
            this.toast('Не удалось загрузить режим сна', 'error');
        }
    }

    renderSleepSettings() {
        const settings = this.sleepSettings || this.sleepStats?.settings;
        if (!settings) return;

        const bed = this.clockShort(settings.target_bed_time);
        const wake = this.clockShort(settings.target_wake_time);
        const target = this.minutesBetweenClocks(settings.target_bed_time, settings.target_wake_time);

        this.setText('currentBedTime', bed);
        this.setText('currentWakeTime', wake);
        this.setText('currentSleepTarget', this.formatMinutes(target));
        this.setText('dashboardSleepTarget', this.formatMinutes(target));
        document.getElementById('targetBedTime').value = bed;
        document.getElementById('targetWakeTime').value = wake;
        this.setText('sleepHeroSchedule', `${bed} → ${wake}`);
    }

    renderSleepStats() {
        const stats = this.sleepStats;
        if (!stats) return;

        const target = stats.target_duration_minutes || 480;
        const todayDuration = stats.today?.duration_minutes || 0;
        const avg = stats.average_duration_minutes || 0;
        const progress = target ? Math.min((todayDuration || avg) / target, 1.2) * 100 : 0;
        const avgProgress = target ? Math.min(avg / target, 1.2) * 100 : 0;
        const score = this.calculateSleepScore(stats);
        const heroDuration = stats.today ? `${this.formatMinutes(todayDuration)} из ${this.formatMinutes(target)}` : 'Нет данных';
        const heroSubtitle = stats.today ? this.sleepDeltaText(todayDuration, target) : 'Добавьте первую запись сна';

        this.setText('weeklySleepAverage', this.formatMinutes(avg));
        this.setText('dashboardSleepDuration', todayDuration ? this.formatMinutes(todayDuration) : this.formatMinutes(avg));
        this.setText('dashboardSleepStatus', this.qualityText(stats.today?.quality || stats.status));
        this.setText('sleepAverage', avg ? this.formatMinutes(avg) : 'Нет данных');
        this.setText('sleepBestDay', stats.best_day ? `${this.weekdayName(stats.best_day.sleep_date)} · ${this.formatMinutes(stats.best_day.duration_minutes)}` : 'Нет данных');
        this.setText('sleepWorstDay', stats.worst_day ? `${this.weekdayName(stats.worst_day.sleep_date)} · ${this.formatMinutes(stats.worst_day.duration_minutes)}` : 'Нет данных');
        this.setText('sleepCompliantDays', stats.days_logged ? `${stats.compliant_days || 0}/${stats.days_logged}` : 'Нет данных');
        this.setText('sleepHeroDuration', heroDuration);
        this.setText('sleepHeroSubtitle', heroSubtitle);
        this.setText('sleepHeroStatus', stats.today ? this.qualityText(stats.today.quality) : 'Нет данных');
        this.setText('sleepScoreValue', score === null ? '—' : score);
        this.setText('sleepScoreText', this.sleepScoreText(score));
        this.renderSleepRecommendations(stats, target);
        this.setText('sleepModeStatus', this.qualityText(stats.status));
        this.setText('sleepQualityLabel', this.qualityText(stats.status));

        document.getElementById('dashboardSleepProgress').style.width = `${Math.min(progress, 100)}%`;
        document.getElementById('sleepProgress').style.width = `${Math.min(avgProgress, 100)}%`;
        const scoreRing = document.querySelector('.sleep-score-ring');
        if (scoreRing) {
            scoreRing.style.setProperty('--score', score === null ? 0 : score);
            scoreRing.dataset.score = this.sleepScoreTone(score);
        }
    }

    renderSleepRecommendations(stats, target) {
        const container = document.getElementById('sleepRecommendation');
        if (!container) return;
        if (!stats?.days_logged) {
            container.innerHTML = `
                <div class="recommendation-item">
                    <i class="fas fa-moon" aria-hidden="true"></i>
                    <span>Добавьте 3-5 записей сна, чтобы получить рекомендации.</span>
                </div>
            `;
            return;
        }

        const items = [];
        const avgDelta = (stats.average_duration_minutes || 0) - target;
        if (avgDelta < 0) {
            items.push(['fa-clock', `Средний сон ниже цели на ${this.formatMinutes(Math.abs(avgDelta))}.`]);
        } else {
            items.push(['fa-check-circle', `Средний сон достигает цели: +${this.formatMinutes(avgDelta)}.`]);
        }
        if (stats.best_day) {
            items.push(['fa-award', `Лучший день: ${this.weekdayName(stats.best_day.sleep_date)} (${this.formatMinutes(stats.best_day.duration_minutes)}).`]);
        }
        if (stats.recommendation) {
            items.push(['fa-lightbulb', stats.recommendation]);
        }

        container.innerHTML = items.map(([icon, text]) => `
            <div class="recommendation-item">
                <i class="fas ${icon}" aria-hidden="true"></i>
                <span>${this.escape(text)}</span>
            </div>
        `).join('');
    }

    renderSleepLogs() {
        const container = document.getElementById('sleepLogsList');
        if (!container) return;

        const logs = this.sleepLogs || [];
        this.setText('sleepLogCount', `${logs.length} ${this.plural(logs.length, 'запись', 'записи', 'записей')}`);
        if (!logs.length) {
            container.innerHTML = `
                <div class="empty-state sleep-empty">
                    <i class="fas fa-moon" aria-hidden="true"></i>
                    <h3>Журнал сна пуст</h3>
                    <p>Добавьте первую запись, чтобы увидеть статистику и рекомендации.</p>
                    <button class="btn btn-primary compact-btn" type="button" onclick="document.getElementById('sleepLogForm')?.scrollIntoView({behavior:'smooth', block:'center'})">Записать сон</button>
                </div>
            `;
            return;
        }

        container.innerHTML = logs.map((log) => `
            <article class="list-item sleep-log-card" data-id="${log.id}">
                <span class="sleep-quality-dot quality-${log.quality}"></span>
                <div class="item-body">
                    <h3>${this.formatDate(log.sleep_date)} · ${this.formatMinutes(log.duration_minutes)}</h3>
                    <p>${this.timeOnly(log.bed_time)} - ${this.timeOnly(log.wake_time)} · ${this.sleepDeltaText(log.duration_minutes, this.sleepStats?.target_duration_minutes || 480)} · ${this.qualityText(log.quality)}</p>
                    ${log.note ? `<p class="note">${this.escape(log.note)}</p>` : ''}
                </div>
                <div class="item-actions">
                    <button class="icon-button" type="button" data-action="sleep-edit" data-id="${log.id}" aria-label="Редактировать запись сна"><i class="fas fa-pen" aria-hidden="true"></i></button>
                    <button class="icon-button danger" type="button" data-action="sleep-delete" data-id="${log.id}" aria-label="Удалить запись сна"><i class="fas fa-trash" aria-hidden="true"></i></button>
                </div>
            </article>
        `).join('');
    }

    async saveSleepSettings() {
        const targetBedTime = document.getElementById('targetBedTime').value;
        const targetWakeTime = document.getElementById('targetWakeTime').value;

        try {
            await this.request('/api/sleep/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    target_bed_time: targetBedTime,
                    target_wake_time: targetWakeTime,
                }),
            });
            this.toast('Режим сна обновлен', 'success');
            await this.loadSleep();
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async saveSleepLog() {
        const payload = {
            sleep_date: document.getElementById('sleepDate').value,
            bed_time: document.getElementById('bedTime').value,
            wake_time: document.getElementById('wakeTime').value,
            quality: document.getElementById('sleepQuality').value,
            note: document.getElementById('sleepNote').value.trim(),
        };

        try {
            if (this.editingSleepLog) {
                await this.request(`/api/sleep/logs/${this.editingSleepLog.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await this.request('/api/sleep/logs', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            this.toast(this.editingSleepLog ? 'Запись сна обновлена' : 'Сон записан', 'success');
            this.cancelSleepEdit();
            await this.loadSleep();
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    editSleepLog(id) {
        const log = (this.sleepLogs || []).find((item) => String(item.id) === String(id));
        if (!log) return;

        this.editingSleepLog = log;
        document.getElementById('sleepDate').value = log.sleep_date;
        document.getElementById('bedTime').value = this.toLocalDateTimeValue(log.bed_time);
        document.getElementById('wakeTime').value = this.toLocalDateTimeValue(log.wake_time);
        document.getElementById('sleepNote').value = log.note || '';
        this.setSleepQuality(log.quality || 'normal');
        this.setText('sleepLogSubmit', 'Сохранить запись');
        document.getElementById('cancelSleepEdit')?.classList.remove('hidden');
        document.getElementById('sleepLogForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    cancelSleepEdit() {
        this.editingSleepLog = null;
        this.setDefaultSleepInputs();
        document.getElementById('sleepNote').value = '';
        this.setSleepQuality('normal');
        this.setText('sleepLogSubmit', 'Записать сон');
        document.getElementById('cancelSleepEdit')?.classList.add('hidden');
    }

    async deleteSleepLog(id) {
        if (!(await this.confirm('Удалить запись сна?'))) return;
        try {
            await this.request(`/api/sleep/logs/${id}`, { method: 'DELETE' });
            this.toast('Запись сна удалена', 'success');
            await this.loadSleep();
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async saveProfileName() {
        const name = document.getElementById('profileNameInput').value.trim();
        if (!name) {
            this.setFormMessage('profileNameMessage', 'Введите имя', 'error');
            this.toast('Введите имя', 'error');
            return;
        }

        const button = document.getElementById('profileNameSubmit');
        this.setLoading(button, true);
        this.setFormMessage('profileNameMessage', '');
        try {
            this.currentUser = await this.request('/api/auth/me', {
                method: 'PUT',
                body: JSON.stringify({ name }),
            });
            localStorage.setItem('user', JSON.stringify(this.currentUser));
            this.updateUserInterface();
            this.setFormMessage('profileNameMessage', 'Имя сохранено', 'success');
            this.toast('Имя обновлено', 'success');
        } catch (error) {
            this.setFormMessage('profileNameMessage', error.message, 'error');
            this.toast(error.message, 'error');
        } finally {
            this.setLoading(button, false);
        }
    }

    async savePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmPassword) {
            this.setFormMessage('profilePasswordMessage', 'Пароли не совпадают', 'error');
            this.toast('Пароли не совпадают', 'error');
            return;
        }

        const button = document.getElementById('profilePasswordSubmit');
        this.setLoading(button, true);
        this.setFormMessage('profilePasswordMessage', '');
        try {
            await this.request('/api/auth/password', {
                method: 'PUT',
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    confirm_password: confirmPassword,
                }),
            });
            document.getElementById('profilePasswordForm').reset();
            this.setFormMessage('profilePasswordMessage', 'Пароль обновлен', 'success');
            this.toast('Пароль обновлен', 'success');
        } catch (error) {
            this.setFormMessage('profilePasswordMessage', error.message, 'error');
            this.toast(error.message, 'error');
        } finally {
            this.setLoading(button, false);
        }
    }

    async loadAdmin() {
        if (this.currentUser?.role !== 'admin') return;

        const statsGrid = document.getElementById('adminStatsGrid');
        const usersTable = document.getElementById('adminUsersTable');
        if (statsGrid) {
            statsGrid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-row"></div>').join('');
        }
        if (usersTable) {
            usersTable.innerHTML = '<tr><td colspan="8"><div class="skeleton-row"></div></td></tr>';
        }

        try {
            const [stats, users] = await Promise.all([
                this.request('/api/admin/stats'),
                this.request('/api/admin/users'),
            ]);
            this.adminStats = stats;
            this.adminUsers = users || [];
            this.renderAdminStats();
            this.renderAdminUsers();
        } catch (error) {
            this.toast(error.message, 'error');
            if (usersTable) {
                usersTable.innerHTML = `<tr><td colspan="8">${this.escape(error.message)}</td></tr>`;
            }
        }
    }

    renderAdminStats() {
        const stats = this.adminStats || {};
        const cards = [
            ['fa-users', stats.total_users || 0, 'пользователей'],
            ['fa-user-plus', stats.new_users_today || 0, 'новых сегодня'],
            ['fa-list-check', stats.total_tasks || 0, 'задач'],
            ['fa-check', stats.completed_tasks || 0, 'выполнено'],
            ['fa-repeat', stats.total_habits || 0, 'привычек'],
            ['fa-bed', stats.total_sleep_logs || 0, 'sleep logs'],
        ];
        const grid = document.getElementById('adminStatsGrid');
        if (grid) {
            grid.innerHTML = cards.map(([icon, value, label]) => `
                <article class="metric-card">
                    <span><i class="fas ${icon}" aria-hidden="true"></i></span>
                    <div>
                        <strong>${this.escape(value)}</strong>
                        <small>${label}</small>
                    </div>
                </article>
            `).join('');
        }

        const days = stats.activity_last_7_days || [];
        const max = Math.max(1, ...days.map((day) => day.total || 0));
        const total = days.reduce((sum, day) => sum + (day.total || 0), 0);
        this.setText('adminActivityTotal', `${total} ${this.plural(total, 'событие', 'события', 'событий')}`);
        const bars = document.getElementById('adminActivityBars');
        if (bars) {
            bars.innerHTML = days.map((day) => {
                const height = Math.max(8, Math.round(((day.total || 0) / max) * 100));
                return `
                    <div class="activity-day" title="${this.escape(day.date)}: ${day.total || 0}">
                        <span style="height:${height}%"></span>
                        <small>${this.escape(this.shortDay(day.date))}</small>
                    </div>
                `;
            }).join('');
        }
    }

    renderAdminUsers() {
        const table = document.getElementById('adminUsersTable');
        const search = (document.getElementById('adminUserSearch')?.value || '').trim().toLowerCase();
        const roleFilter = document.getElementById('adminRoleFilter')?.value || 'all';
        const statusFilter = document.getElementById('adminStatusFilter')?.value || 'all';
        const users = (this.adminUsers || []).filter((user) => {
            const matchesSearch = !search || `${user.name} ${user.email}`.toLowerCase().includes(search);
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            const matchesStatus = statusFilter === 'all' || (statusFilter === 'disabled' ? user.disabled : !user.disabled);
            return matchesSearch && matchesRole && matchesStatus;
        });
        this.setText('adminUserCount', `${users.length} ${this.plural(users.length, 'пользователь', 'пользователя', 'пользователей')}`);
        if (!table) return;
        if (!users.length) {
            table.innerHTML = '<tr><td colspan="10">Пользователей не найдено</td></tr>';
            return;
        }
        table.innerHTML = users.map((user) => `
            <tr class="${user.disabled ? 'disabled-user' : ''}">
                <td data-label="ID">${user.id}</td>
                <td data-label="Имя"><strong>${this.escape(user.name)}</strong></td>
                <td data-label="Email">${this.escape(user.email)}</td>
                <td data-label="Role">
                    <select class="admin-role-select" data-action="admin-role" data-id="${user.id}" aria-label="Изменить роль">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                </td>
                <td data-label="Статус"><span class="status-badge ${user.disabled ? 'status-disabled' : 'status-active'}">${user.disabled ? 'disabled' : 'active'}</span></td>
                <td data-label="Регистрация">${this.formatDate(user.created_at)}</td>
                <td data-label="Задачи">${user.task_count || 0}</td>
                <td data-label="Привычки">${user.habit_count || 0}</td>
                <td data-label="Сон">${user.sleep_log_count || 0}</td>
                <td data-label="Действия">
                    <div class="admin-actions">
                        <button class="icon-button" type="button" data-action="admin-status" data-id="${user.id}" data-disabled="${!user.disabled}" aria-label="${user.disabled ? 'Включить' : 'Отключить'} пользователя">
                            <i class="fas ${user.disabled ? 'fa-user-check' : 'fa-user-slash'}" aria-hidden="true"></i>
                        </button>
                        <button class="icon-button danger" type="button" data-action="admin-delete" data-id="${user.id}" data-name="${this.escape(user.name)}" data-email="${this.escape(user.email)}" aria-label="Удалить пользователя">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async updateAdminRole(id, role) {
        const user = (this.adminUsers || []).find((item) => String(item.id) === String(id));
        if (!user || user.role === role) return;
        const confirmed = await this.confirm(`Изменить роль пользователя ${user.email} на ${role}?`, 'Изменить');
        if (!confirmed) {
            this.renderAdminUsers();
            return;
        }
        try {
            await this.request(`/api/admin/users/${id}/role`, {
                method: 'PATCH',
                body: JSON.stringify({ role, confirm: true }),
            });
            this.toast('Роль обновлена', 'success');
            await this.loadAdmin();
        } catch (error) {
            this.toast(error.message, 'error');
            this.renderAdminUsers();
        }
    }

    async updateAdminStatus(id, disabled) {
        const user = (this.adminUsers || []).find((item) => String(item.id) === String(id));
        if (!user) return;
        const action = disabled ? 'отключить' : 'включить';
        if (!(await this.confirm(`Вы уверены, что хотите ${action} аккаунт ${user.email}?`, disabled ? 'Отключить' : 'Включить'))) return;
        try {
            await this.request(`/api/admin/users/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ disabled, confirm: true }),
            });
            this.toast(disabled ? 'Аккаунт отключен' : 'Аккаунт включен', 'success');
            await this.loadAdmin();
        } catch (error) {
            this.toast(error.message, 'error');
        } finally {
            this.setLoading(button, false);
        }
    }

    async deleteAdminUser(id, name, email) {
        const label = email || name || `ID ${id}`;
        if (!(await this.confirm(`Удалить пользователя ${label}? Это действие нельзя отменить.`, 'Удалить'))) return;
        try {
            await this.request(`/api/admin/users/${id}`, { method: 'DELETE' });
            this.toast('Пользователь удален', 'success');
            await this.loadAdmin();
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    updateUserInterface() {
        if (!this.currentUser) return;
        const name = this.currentUser.name || 'Пользователь';
        document.querySelectorAll('.user-name').forEach((item) => {
            item.textContent = name;
        });
        this.setText('profileName', name);
        this.setText('profileEmail', this.currentUser.email || '');
        this.setText('profileCreatedAt', this.formatDate(this.currentUser.created_at));
        this.setText('profileRole', this.currentUser.role || 'user');
        document.getElementById('profileRole')?.classList.toggle('role-admin', this.currentUser.role === 'admin');
        this.setText('profileAvatar', name.slice(0, 1).toUpperCase());
        document.getElementById('profileNameInput').value = name;
        document.getElementById('passwordUsername').value = this.currentUser.email || '';
        document.querySelectorAll('.admin-only').forEach((item) => {
            item.classList.toggle('hidden', this.currentUser.role !== 'admin');
        });
        document.body.classList.toggle('has-admin', this.currentUser.role === 'admin');
    }

    handleActionClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        const { action, id, subtaskId } = button.dataset;
        const actions = {
            'task-toggle': () => this.toggleTask(id),
            'task-edit': () => this.editTask(id),
            'task-delete': () => this.deleteTask(id),
            'task-pomodoro': () => this.startPomodoro(id),
            'subtask-toggle': () => this.toggleSubtask(id, subtaskId),
            'habit-toggle': () => this.toggleHabit(id),
            'habit-edit': () => this.editHabit(id),
            'habit-delete': () => this.deleteHabit(id),
            'sleep-edit': () => this.editSleepLog(id),
            'sleep-delete': () => this.deleteSleepLog(id),
            'admin-status': () => this.updateAdminStatus(id, button.dataset.disabled === 'true'),
            'admin-delete': () => this.deleteAdminUser(id, button.dataset.name, button.dataset.email),
        };

        actions[action]?.();
    }

    openModal(id) {
        const layer = document.getElementById('modalLayer');
        document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
        layer?.classList.add('active');
        layer?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        window.setTimeout(() => document.querySelector(`#${id} input, #${id} button`)?.focus(), 50);
    }

    closeModal(result = false) {
        const layer = document.getElementById('modalLayer');
        layer?.classList.remove('active');
        layer?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
        document.querySelectorAll('.modal .btn.is-loading').forEach((button) => this.setLoading(button, false));
        this.editingTask = null;
        this.editingHabit = null;
        if (this.confirmResolver) {
            this.confirmResolver(result);
            this.confirmResolver = null;
        }
    }

    confirm(message, actionLabel = 'Подтвердить') {
        this.setText('confirmMessage', message);
        this.setText('confirmAction', actionLabel);
        this.openModal('confirmModal');
        return new Promise((resolve) => {
            this.confirmResolver = resolve;
        });
    }

    async logout() {
        try {
            await this.request('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            // Local logout must still work if the server is unavailable.
        } finally {
            this.clearAuth();
            this.redirectToAuth();
        }
    }

    clearAuth() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    redirectToAuth() {
        window.location.href = window.location.protocol === 'file:' ? 'index.html' : '/auth';
    }

    async toggleTheme() {
        const resolved = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        await this.setPreference('theme', resolved === 'dark' ? 'light' : 'dark');
    }

    getPreferredTheme() {
        const mode = this.preferences?.theme || localStorage.getItem('theme');
        if (mode === 'light' || mode === 'dark') return mode;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    async setTheme(theme) {
        await this.setPreference('theme', theme);
    }

    defaultPreferences() {
        return {
            theme: 'dark',
            accent: 'purple-blue',
            density: 'comfortable',
            motion: 'normal',
            backgroundGlow: true,
        };
    }

    loadLocalPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem('preferences') || '{}');
            const legacyTheme = localStorage.getItem('theme');
            return {
                ...this.defaultPreferences(),
                ...stored,
                theme: stored.theme || legacyTheme || this.defaultPreferences().theme,
            };
        } catch (error) {
            return this.defaultPreferences();
        }
    }

    async loadPreferences() {
        try {
            const prefs = await this.request('/api/user/preferences');
            this.applyPreferences(prefs, true);
        } catch (error) {
            const fallback = { ...this.loadLocalPreferences(), theme: this.currentUser?.theme || this.loadLocalPreferences().theme };
            this.applyPreferences(fallback, true);
        }
    }

    async handlePreferenceClick(button) {
        const key = button.dataset.preference;
        const rawValue = button.dataset.value;
        const value = rawValue === 'toggle' ? !this.preferences.backgroundGlow : rawValue;
        await this.setPreference(key, value);
    }

    async setPreference(key, value) {
        const next = { ...this.preferences, [key]: value };
        this.applyPreferences(next, true);

        if (!localStorage.getItem('token')) return;

        try {
            const prefs = await this.request('/api/user/preferences', {
                method: 'PATCH',
                body: JSON.stringify(next),
            });
            this.applyPreferences(prefs, true);
        } catch (error) {
            this.toast('Настройка применена локально, но не синхронизировалась', 'error');
        }
    }

    applyPreferences(prefs, persist = false) {
        this.preferences = { ...this.defaultPreferences(), ...(prefs || {}) };
        const resolvedTheme = this.resolveTheme(this.preferences.theme);
        document.documentElement.dataset.theme = resolvedTheme;
        document.documentElement.dataset.themeMode = this.preferences.theme;
        document.documentElement.dataset.accent = this.preferences.accent;
        document.documentElement.dataset.density = this.preferences.density;
        document.documentElement.dataset.motion = this.preferences.motion;
        document.documentElement.dataset.glow = this.preferences.backgroundGlow ? 'on' : 'off';
        if (persist) {
            localStorage.setItem('preferences', JSON.stringify(this.preferences));
            localStorage.setItem('theme', this.preferences.theme);
        }
        const icon = resolvedTheme === 'dark' ? 'fa-sun' : 'fa-moon';
        document.querySelectorAll('#themeToggle i, #mobileThemeToggle i').forEach((item) => {
            item.className = `fas ${icon}`;
        });
        document.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.classList.toggle('active', button.dataset.themeChoice === this.preferences.theme);
        });
        document.querySelectorAll('[data-preference]').forEach((button) => {
            const key = button.dataset.preference;
            const value = button.dataset.value;
            const active = value === 'toggle' ? Boolean(this.preferences.backgroundGlow) : String(this.preferences[key]) === value;
            button.classList.toggle('active', active);
            if (key === 'backgroundGlow') {
                const icon = button.querySelector('i');
                if (icon) icon.className = `fas ${this.preferences.backgroundGlow ? 'fa-toggle-on' : 'fa-toggle-off'}`;
            }
        });
    }

    resolveTheme(mode) {
        if (mode === 'light' || mode === 'dark') return mode;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    setFormMessage(id, message, type = '') {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = message || '';
        element.className = `form-message${type ? ` ${type}` : ''}`;
    }

    setLoading(button, loading) {
        if (!button) return;
        button.disabled = loading;
        button.classList.toggle('is-loading', loading);
    }

    setDefaultSleepInputs() {
        const now = new Date();
        const sleepDate = new Date(now);
        const bed = new Date(now);
        const wake = new Date(now);

        if (now.getHours() < 12) {
            bed.setDate(bed.getDate() - 1);
        } else {
            wake.setDate(wake.getDate() + 1);
        }

        bed.setHours(23, 0, 0, 0);
        wake.setHours(7, 0, 0, 0);

        const sleepDateInput = document.getElementById('sleepDate');
        const bedInput = document.getElementById('bedTime');
        const wakeInput = document.getElementById('wakeTime');

        if (sleepDateInput) sleepDateInput.value = this.dateInputValue(sleepDate);
        if (bedInput) bedInput.value = this.localDateTimeInputValue(bed);
        if (wakeInput) wakeInput.value = this.localDateTimeInputValue(wake);
        this.setSleepQuality('normal');
    }

    setTaskDateBounds() {
        const input = document.getElementById('taskDueDate');
        if (!input) return;
        const now = new Date();
        now.setSeconds(0, 0);
        const minValue = this.localDateTimeInputValue(now);
        input.min = minValue;
        if (!input.value) {
            const defaultDue = new Date(now);
            defaultDue.setHours(defaultDue.getHours() + 1);
            input.value = this.localDateTimeInputValue(defaultDue);
        }
    }

    toast(message, type = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}" aria-hidden="true"></i>
            <span>${this.escape(message)}</span>
            <button type="button" aria-label="Закрыть"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        `;
        toast.querySelector('button').addEventListener('click', () => toast.remove());
        stack.appendChild(toast);
        window.setTimeout(() => toast.classList.add('show'), 20);
        window.setTimeout(() => {
            toast.classList.remove('show');
            window.setTimeout(() => toast.remove(), 250);
        }, 4500);
    }

    emptyState(icon, title, text) {
        return `
            <div class="empty-state">
                <i class="fas ${icon}" aria-hidden="true"></i>
                <h3>${title}</h3>
                <p>${text}</p>
            </div>
        `;
    }

    setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[char]);
    }

    safeColor(value) {
        return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#4f46e5';
    }

    formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value.split('-').reverse().join('.');
        }
        if (Number.isNaN(date.getTime())) return '-';
        return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
    }

    formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    }

    shortDay(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value || '').slice(5);
        return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date);
    }

    formatMinutes(minutes) {
        const value = Math.max(0, Number(minutes) || 0);
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        return `${hours}ч ${String(mins).padStart(2, '0')}м`;
    }

    timeOnly(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--:--';
        return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
    }

    toLocalDateTimeValue(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return this.localDateTimeInputValue(date);
    }

    localDateTimeInputValue(date) {
        const pad = (number) => String(number).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    dateInputValue(date) {
        const pad = (number) => String(number).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    todayDateValue() {
        return this.dateInputValue(new Date());
    }

    taskDateValue(value) {
        const now = new Date();
        now.setSeconds(0, 0);
        const minValue = this.localDateTimeInputValue(now);
        if (!value) {
            const defaultDue = new Date(now);
            defaultDue.setHours(defaultDue.getHours() + 1);
            return this.localDateTimeInputValue(defaultDue);
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return minValue;
        const candidate = this.localDateTimeInputValue(date);
        return candidate < minValue ? minValue : candidate;
    }

    clockShort(value) {
        return String(value || '00:00').slice(0, 5);
    }

    minutesBetweenClocks(bed, wake) {
        const toMinutes = (value) => {
            const [hours, minutes] = this.clockShort(value).split(':').map(Number);
            return hours * 60 + minutes;
        };
        const start = toMinutes(bed);
        let end = toMinutes(wake);
        if (end <= start) end += 24 * 60;
        return end - start;
    }

    qualityText(quality) {
        return {
            poor: 'мало сна',
            normal: 'нормально',
            great: 'отлично',
            empty: 'нет данных',
        }[quality] || 'нет данных';
    }

    setSleepQuality(quality) {
        const value = ['poor', 'normal', 'good', 'great'].includes(quality) ? quality : 'normal';
        const input = document.getElementById('sleepQuality');
        if (input) input.value = value;
        document.querySelectorAll('[data-sleep-quality]').forEach((button) => {
            button.classList.toggle('active', button.dataset.sleepQuality === value);
        });
    }

    calculateSleepScore(stats) {
        if (!stats?.days_logged) return null;
        const target = stats.target_duration_minutes || 480;
        const avg = stats.average_duration_minutes || 0;
        const durationScore = Math.max(0, 100 - Math.round(Math.abs(avg - target) / 6));
        const consistencyScore = Math.round(((stats.compliant_days || 0) / Math.max(1, stats.days_logged)) * 100);
        const qualityBonus = stats.status === 'great' ? 8 : stats.status === 'poor' ? -14 : 0;
        return Math.max(0, Math.min(100, Math.round(durationScore * 0.65 + consistencyScore * 0.35 + qualityBonus)));
    }

    sleepScoreText(score) {
        if (score === null) return 'Добавьте записи сна, чтобы получить оценку';
        if (score >= 85) return 'Отличный режим. Продолжайте держать ритм.';
        if (score >= 70) return 'Нормально. Есть небольшой запас для стабильности.';
        if (score >= 50) return 'Слабый режим. Стоит лечь раньше и выровнять график.';
        return 'Плохо. Сфокусируйтесь на длительности и регулярности.';
    }

    sleepScoreTone(score) {
        if (score === null) return 'empty';
        if (score >= 85) return 'great';
        if (score >= 70) return 'normal';
        if (score >= 50) return 'weak';
        return 'poor';
    }

    sleepDeltaText(duration, target) {
        if (!duration) return 'Нет данных';
        const diff = duration - target;
        if (Math.abs(diff) < 10) return 'точно по цели';
        return diff > 0 ? `выше цели на ${this.formatMinutes(diff)}` : `ниже цели на ${this.formatMinutes(Math.abs(diff))}`;
    }

    weekdayName(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return this.formatDate(value);
        return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
    }

    plural(count, one, few, many) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProductivityDashboard();
});
