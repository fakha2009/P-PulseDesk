class ProductivityDashboard {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentFilter = 'all';
        this.currentUser = null;
        this.editingTask = null;
        this.editingHabit = null;
        this.editingSleepLog = null;
        this.searchTimer = null;
        this.confirmResolver = null;
        this.init();
    }

    async init() {
        this.applyTheme(localStorage.getItem('theme') || 'light');

        if (!localStorage.getItem('token')) {
            this.redirectToAuth();
            return;
        }

        this.bindEvents();
        this.setDefaultSleepInputs();
        this.setTaskDateBounds();

        try {
            this.currentUser = await this.request('/api/auth/me');
            localStorage.setItem('user', JSON.stringify(this.currentUser));
            this.updateUserInterface();
            this.showPage('dashboard');
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

        document.getElementById('mobileMenuButton')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('open');
        });

        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('mobileThemeToggle')?.addEventListener('click', () => this.toggleTheme());

        document.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.addEventListener('click', () => this.applyTheme(button.dataset.themeChoice, true));
        });

        document.getElementById('sidebarLogout')?.addEventListener('click', () => this.logout());
        document.getElementById('profileLogout')?.addEventListener('click', () => this.logout());

        document.getElementById('addTaskButton')?.addEventListener('click', () => this.openTaskModal());
        document.getElementById('taskForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveTask();
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

        document.getElementById('sleepLogForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveSleepLog();
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
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                document.getElementById('sidebar')?.classList.remove('open');
                this.closeModal(false);
            }
        });
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

    async loadPageData() {
        if (this.currentPage === 'dashboard') {
            await this.loadDashboard();
        }
        if (this.currentPage === 'tasks') {
            await this.loadTasks();
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

    showPage(page) {
        if (page === 'admin' && this.currentUser?.role !== 'admin') {
            this.toast('Доступ только для администратора', 'error');
            page = 'dashboard';
        }
        this.currentPage = page;
        document.querySelectorAll('.page').forEach((section) => {
            section.classList.toggle('active', section.id === `${page}-page`);
        });
        document.querySelectorAll('.nav-link, .bottom-link').forEach((button) => {
            button.classList.toggle('active', button.dataset.page === page);
        });
        document.getElementById('sidebar')?.classList.remove('open');
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        container.innerHTML = tasks.slice(0, 5).map((task) => this.taskTemplate(task, true)).join('');
    }

    renderDashboardHabits(habits) {
        const container = document.getElementById('dashboardHabits');
        if (!container) return;
        if (!habits.length) {
            container.innerHTML = this.emptyState('fa-repeat', 'Привычек пока нет', 'Создайте первый ежедневный ритуал.');
            return;
        }
        container.innerHTML = habits.map((habit) => this.habitTemplate(habit, true)).join('');
    }

    renderProductivityScore() {
        const taskScore = this.stats?.productivity_score ?? 0;
        const sleepScore = this.sleepStats ? this.sleepScore(this.sleepStats) : 0;
        const score = Math.round((taskScore + sleepScore) / (this.sleepStats ? 2 : 1));
        const clamped = Math.max(0, Math.min(100, score));
        const circle = document.getElementById('scoreRing');
        const circumference = 2 * Math.PI * 52;

        this.setText('productivityScore', `${clamped}%`);
        this.setText('scoreCaption', clamped >= 75 ? 'Стабильный день' : clamped >= 45 ? 'Есть пространство для улучшения' : 'Начните с одного небольшого действия');
        if (circle) {
            circle.style.strokeDasharray = `${circumference}`;
            circle.style.strokeDashoffset = `${circumference - (clamped / 100) * circumference}`;
        }
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
        } catch (error) {
            this.toast('Не удалось загрузить задачи', 'error');
        }
    }

    renderTasks() {
        const container = document.getElementById('tasksList');
        if (!container) return;
        if (!this.tasks?.length) {
            container.innerHTML = this.emptyState('fa-list-check', 'Задач нет', 'Создайте задачу, чтобы зафиксировать следующий шаг.');
            return;
        }
        container.innerHTML = this.tasks.map((task) => this.taskTemplate(task)).join('');
    }

    taskTemplate(task, compact = false) {
        const priorityText = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[task.priority] || 'Средний';
        const due = task.due_date ? this.formatDate(task.due_date) : '';
        const completed = task.completed ? 'completed' : '';
        return `
            <article class="list-item ${completed}" data-id="${task.id}">
                <button class="check-button ${task.completed ? 'checked' : ''}" type="button" data-action="task-toggle" data-id="${task.id}" aria-label="Изменить статус задачи">
                    <i class="fas fa-check" aria-hidden="true"></i>
                </button>
                <div class="item-body">
                    <h3>${this.escape(task.title)}</h3>
                    ${task.description && !compact ? `<p>${this.escape(task.description)}</p>` : ''}
                    <div class="item-meta">
                        <span class="priority priority-${task.priority}">${priorityText}</span>
                        ${due ? `<span><i class="fas fa-calendar" aria-hidden="true"></i> ${due}</span>` : ''}
                    </div>
                </div>
                ${compact ? '' : `
                    <div class="item-actions">
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
        this.openModal('taskModal');
    }

    async saveTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            this.toast('Введите название задачи', 'error');
            return;
        }

        const dueValue = document.getElementById('taskDueDate').value;
        if (dueValue && dueValue < this.todayDateValue()) {
            this.toast('Срок задачи не может быть в прошлом', 'error');
            return;
        }
        const payload = {
            title,
            description: document.getElementById('taskDescription').value.trim(),
            priority: document.getElementById('taskPriority').value,
            due_date: dueValue ? new Date(`${dueValue}T12:00:00`).toISOString() : null,
        };

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
        this.openModal('habitModal');
    }

    async saveHabit() {
        const title = document.getElementById('habitTitle').value.trim();
        if (!title) {
            this.toast('Введите название привычки', 'error');
            return;
        }

        const payload = {
            title,
            description: document.getElementById('habitDescription').value.trim(),
            color: document.getElementById('habitColor').value,
        };

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
    }

    renderSleepStats() {
        const stats = this.sleepStats;
        if (!stats) return;

        const target = stats.target_duration_minutes || 480;
        const todayDuration = stats.today?.duration_minutes || 0;
        const avg = stats.average_duration_minutes || 0;
        const progress = target ? Math.min((todayDuration || avg) / target, 1.2) * 100 : 0;
        const avgProgress = target ? Math.min(avg / target, 1.2) * 100 : 0;

        this.setText('weeklySleepAverage', this.formatMinutes(avg));
        this.setText('dashboardSleepDuration', todayDuration ? this.formatMinutes(todayDuration) : this.formatMinutes(avg));
        this.setText('dashboardSleepStatus', this.qualityText(stats.today?.quality || stats.status));
        this.setText('sleepAverage', this.formatMinutes(avg));
        this.setText('sleepBestDay', stats.best_day ? `${this.formatDate(stats.best_day.sleep_date)} · ${this.formatMinutes(stats.best_day.duration_minutes)}` : 'нет');
        this.setText('sleepWorstDay', stats.worst_day ? `${this.formatDate(stats.worst_day.sleep_date)} · ${this.formatMinutes(stats.worst_day.duration_minutes)}` : 'нет');
        this.setText('sleepCompliantDays', `${stats.compliant_days || 0}/7`);
        this.setText('sleepRecommendation', stats.recommendation || 'Добавьте первую запись сна.');
        this.setText('sleepModeStatus', this.qualityText(stats.status));
        this.setText('sleepQualityLabel', this.qualityText(stats.status));

        document.getElementById('dashboardSleepProgress').style.width = `${Math.min(progress, 100)}%`;
        document.getElementById('sleepProgress').style.width = `${Math.min(avgProgress, 100)}%`;
    }

    renderSleepLogs() {
        const container = document.getElementById('sleepLogsList');
        if (!container) return;

        const logs = this.sleepLogs || [];
        this.setText('sleepLogCount', `${logs.length} ${this.plural(logs.length, 'запись', 'записи', 'записей')}`);
        if (!logs.length) {
            container.innerHTML = this.emptyState('fa-moon', 'История сна пуста', 'Запишите первую ночь, чтобы увидеть статистику за неделю.');
            return;
        }

        container.innerHTML = logs.map((log) => `
            <article class="list-item sleep-log" data-id="${log.id}">
                <span class="sleep-quality-dot quality-${log.quality}"></span>
                <div class="item-body">
                    <h3>${this.formatDate(log.sleep_date)} · ${this.formatMinutes(log.duration_minutes)}</h3>
                    <p>${this.timeOnly(log.bed_time)} - ${this.timeOnly(log.wake_time)} · ${this.qualityText(log.quality)}</p>
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
        this.setText('sleepLogSubmit', 'Сохранить запись');
        document.getElementById('cancelSleepEdit')?.classList.remove('hidden');
        document.getElementById('sleepLogForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    cancelSleepEdit() {
        this.editingSleepLog = null;
        this.setDefaultSleepInputs();
        document.getElementById('sleepNote').value = '';
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
            this.toast('Введите имя', 'error');
            return;
        }

        try {
            this.currentUser = await this.request('/api/auth/me', {
                method: 'PUT',
                body: JSON.stringify({ name }),
            });
            localStorage.setItem('user', JSON.stringify(this.currentUser));
            this.updateUserInterface();
            this.toast('Имя обновлено', 'success');
        } catch (error) {
            this.toast(error.message, 'error');
        }
    }

    async savePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmPassword) {
            this.toast('Пароли не совпадают', 'error');
            return;
        }

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
            this.toast('Пароль обновлен', 'success');
        } catch (error) {
            this.toast(error.message, 'error');
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
        const users = this.adminUsers || [];
        this.setText('adminUserCount', `${users.length} ${this.plural(users.length, 'пользователь', 'пользователя', 'пользователей')}`);
        if (!table) return;
        if (!users.length) {
            table.innerHTML = '<tr><td colspan="8">Пользователей пока нет</td></tr>';
            return;
        }
        table.innerHTML = users.map((user) => `
            <tr>
                <td data-label="ID">${user.id}</td>
                <td data-label="Имя"><strong>${this.escape(user.name)}</strong></td>
                <td data-label="Email">${this.escape(user.email)}</td>
                <td data-label="Role"><span class="role-badge role-${this.escape(user.role)}">${this.escape(user.role)}</span></td>
                <td data-label="Регистрация">${this.formatDate(user.created_at)}</td>
                <td data-label="Задачи">${user.task_count || 0}</td>
                <td data-label="Привычки">${user.habit_count || 0}</td>
                <td data-label="Сон">${user.sleep_log_count || 0}</td>
            </tr>
        `).join('');
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

        const { action, id } = button.dataset;
        const actions = {
            'task-toggle': () => this.toggleTask(id),
            'task-edit': () => this.editTask(id),
            'task-delete': () => this.deleteTask(id),
            'habit-toggle': () => this.toggleHabit(id),
            'habit-edit': () => this.editHabit(id),
            'habit-delete': () => this.deleteHabit(id),
            'sleep-edit': () => this.editSleepLog(id),
            'sleep-delete': () => this.deleteSleepLog(id),
        };

        actions[action]?.();
    }

    openModal(id) {
        const layer = document.getElementById('modalLayer');
        document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
        layer?.classList.add('active');
        layer?.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => document.querySelector(`#${id} input, #${id} button`)?.focus(), 50);
    }

    closeModal(result = false) {
        const layer = document.getElementById('modalLayer');
        layer?.classList.remove('active');
        layer?.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
        this.editingTask = null;
        this.editingHabit = null;
        if (this.confirmResolver) {
            this.confirmResolver(result);
            this.confirmResolver = null;
        }
    }

    confirm(message) {
        this.setText('confirmMessage', message);
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

    toggleTheme() {
        const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        this.applyTheme(current === 'dark' ? 'light' : 'dark', true);
    }

    applyTheme(theme, persist = false) {
        document.documentElement.dataset.theme = theme;
        if (persist) {
            localStorage.setItem('theme', theme);
        }
        const icon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
        document.querySelectorAll('#themeToggle i, #mobileThemeToggle i').forEach((item) => {
            item.className = `fas ${icon}`;
        });
        document.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.classList.toggle('active', button.dataset.themeChoice === theme);
        });
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
    }

    setTaskDateBounds() {
        const input = document.getElementById('taskDueDate');
        if (!input) return;
        const today = this.todayDateValue();
        input.min = today;
        if (!input.value) {
            input.value = today;
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
        const today = this.todayDateValue();
        if (!value) return today;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return today;
        const candidate = this.dateInputValue(date);
        return candidate < today ? today : candidate;
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
