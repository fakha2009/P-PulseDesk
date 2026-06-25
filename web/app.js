class ProductivityDashboard {
    constructor() {
        this.routes = {
            dashboard: '/dashboard',
            tasks: '/tasks',
            calendar: '/calendar',
            habits: '/habits',
            sleep: '/sleep',
            profile: '/profile',
            library: '/library',
            admin: '/admin',
        };
        this.currentPage = this.pageFromPath(window.location.pathname);
        this.currentFilter = 'all';
        this.currentUser = null;
        this.preferences = this.defaultPreferences();
        this.editingTask = null;
        this.taskDatePicker = {
            open: false,
            selectedDate: null,
            viewDate: new Date(),
        };
        this.editingHabit = null;
        this.proofHabit = null;
        this.proofType = 'note';
        this.recordedAudioFile = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.onboardingStep = 0;
        this.proofFilter = 'all';
        this.proofLibrary = { items: [], total: 0, page: 1, limit: 24, has_more: false };
        this.proofLibraryLoading = false;
        this.proofMediaURLs = new Map();
        this.proofAudioDurations = new Map();
        this.activeProofPreviewID = null;
        this.proofSearchTimer = null;
        this.editingSleepLog = null;
        this.searchTimer = null;
        this.clockTimer = null;
        this.notificationTimer = null;
        this.installPromptTimer = null;
        this.deferredInstallPrompt = null;
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
            this.maybeOpenOnboarding();
            this.scheduleInstallPrompt();
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
        document.getElementById('replayOnboardingButton')?.addEventListener('click', () => this.openOnboarding(true));
        document.getElementById('pwaInstallButton')?.addEventListener('click', () => this.installPwa());
        document.getElementById('pwaInstallDismiss')?.addEventListener('click', () => this.dismissInstallPrompt());
        document.getElementById('profileInstallPwaButton')?.addEventListener('click', () => this.installPwa({ manual: true }));

        document.getElementById('onboardingNext')?.addEventListener('click', () => this.nextOnboardingStep());
        document.getElementById('onboardingBack')?.addEventListener('click', () => this.previousOnboardingStep());
        document.getElementById('onboardingSkip')?.addEventListener('click', () => this.completeOnboarding());
        document.getElementById('onboardingDots')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-onboarding-step]');
            if (button) {
                this.onboardingStep = Number(button.dataset.onboardingStep) || 0;
                this.renderOnboarding();
            }
        });

        document.getElementById('addTaskButton')?.addEventListener('click', () => this.openTaskModal());
        document.getElementById('taskForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveTask();
        });
        this.bindTaskDatePicker();
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
        document.getElementById('proofForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveHabitProof();
        });
        document.querySelectorAll('[data-proof-choice]').forEach((button) => {
            button.addEventListener('click', () => this.setProofType(button.dataset.proofChoice));
        });
        document.getElementById('proofFile')?.addEventListener('change', () => this.renderProofPreview());
        document.getElementById('startAudioRecord')?.addEventListener('click', () => this.startAudioRecording());
        document.getElementById('stopAudioRecord')?.addEventListener('click', () => this.stopAudioRecording());

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
        document.querySelectorAll('[data-proof-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                this.proofFilter = button.dataset.proofFilter;
                document.querySelectorAll('[data-proof-filter]').forEach((item) => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-selected', String(active));
                });
                button.classList.add('active');
                this.loadProofLibrary({ reset: true });
            });
        });
        document.getElementById('proofDateFrom')?.addEventListener('change', () => this.loadProofLibrary({ reset: true }));
        document.getElementById('proofDateTo')?.addEventListener('change', () => this.loadProofLibrary({ reset: true }));
        document.getElementById('proofDateReset')?.addEventListener('click', () => this.resetProofDateFilters());
        document.getElementById('proofLoadMore')?.addEventListener('click', () => this.loadProofLibrary({ append: true }));
        document.getElementById('proofSearch')?.addEventListener('input', () => {
            window.clearTimeout(this.proofSearchTimer);
            this.proofSearchTimer = window.setTimeout(() => this.renderProofLibrary(), 150);
        });

        document.querySelectorAll('[data-close-modal]').forEach((button) => {
            button.addEventListener('click', () => this.closeModal(false));
        });

        document.getElementById('modalLayer')?.addEventListener('click', (event) => {
            if (event.target.id === 'modalLayer') {
                this.closeModal(false);
            }
        });

        document.getElementById('confirmAction')?.addEventListener('click', () => this.closeModal(true));
        document.getElementById('proofPreviewDelete')?.addEventListener('click', async () => {
            if (this.activeProofPreviewID) {
                await this.deleteProof(this.activeProofPreviewID);
            }
        });

        document.addEventListener('click', (event) => this.handleActionClick(event));
        document.addEventListener('toggle', (event) => {
            const menu = event.target.closest?.('.proof-action-menu');
            if (!menu?.open) return;
            document.querySelectorAll('.proof-action-menu[open]').forEach((item) => {
                if (item !== menu) item.removeAttribute('open');
            });
        }, true);
        document.addEventListener('loadedmetadata', (event) => {
            const audio = event.target.closest?.('audio[data-proof-duration]');
            if (!audio || !Number.isFinite(audio.duration)) return;
            this.proofAudioDurations.set(audio.dataset.proofDuration, audio.duration);
            this.setText(`proofDuration-${audio.dataset.proofDuration}`, this.formatDuration(audio.duration));
        }, true);
        document.addEventListener('change', (event) => {
            const select = event.target.closest('[data-action="admin-role"]');
            if (select) {
                this.updateAdminRole(select.dataset.id, select.value);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.closeTaskDatePicker()) {
                    event.preventDefault();
                    return;
                }
                this.closeSidebar();
                this.closeModal(false);
            }
        });

        window.addEventListener('popstate', () => {
            this.showPage(this.pageFromPath(window.location.pathname), { history: false });
        });

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            this.updateInstallControls();
            this.scheduleInstallPrompt();
        });

        window.addEventListener('appinstalled', () => {
            localStorage.setItem('pwa_install_last_success_at', String(Date.now()));
            this.deferredInstallPrompt = null;
            this.hideInstallPrompt();
            this.updateInstallControls();
            this.toast('PulseDesk установлен на телефон', 'success');
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
        return window.PulseDeskClient.apiFetch(path, options);
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
        navigator.serviceWorker.register('/sw.js').then((registration) => {
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                worker?.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.toast('Доступна новая версия PulseDesk. Обновите страницу, когда будет удобно.', 'info');
                    }
                });
            });
        }).catch(() => {});
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'navigate' && event.data.page) {
                this.showPage(event.data.page);
            }
        });
    }

    scheduleInstallPrompt(delay = 30000) {
        if (this.installPromptTimer) {
            clearTimeout(this.installPromptTimer);
        }
        if (!this.canShowInstallPrompt()) {
            return;
        }
        this.installPromptTimer = window.setTimeout(() => this.showInstallPrompt(), delay);
        this.updateInstallControls();
    }

    canShowInstallPrompt(options = {}) {
        if (window.location.protocol === 'file:' || this.isPwaInstalled()) {
            return false;
        }
        const dismissedAt = Number(sessionStorage.getItem('pwa_install_dismissed_at') || 0);
        if (!options.force && dismissedAt) {
            return false;
        }
        return Boolean(this.deferredInstallPrompt || this.isMobileInstallCandidate() || options.force);
    }

    isPwaInstalled() {
        return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    isMobileInstallCandidate() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    isIosDevice() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    showInstallPrompt(options = {}) {
        if (!this.canShowInstallPrompt(options)) {
            return;
        }
        if (document.getElementById('onboardingLayer')?.classList.contains('active')) {
            this.scheduleInstallPrompt(10000);
            return;
        }

        const prompt = document.getElementById('pwaInstallPrompt');
        const text = document.getElementById('pwaInstallText');
        const button = document.getElementById('pwaInstallButton');
        if (!prompt) return;

        if (text) {
            text.textContent = this.deferredInstallPrompt
                ? 'Добавьте приложение на главный экран, чтобы открывать его без браузера.'
                : this.installManualHint();
        }
        if (button) {
            button.textContent = this.deferredInstallPrompt ? 'Установить' : 'Как добавить';
        }
        prompt.classList.add('active');
        prompt.setAttribute('aria-hidden', 'false');
        this.updateInstallControls();
    }

    hideInstallPrompt() {
        const prompt = document.getElementById('pwaInstallPrompt');
        prompt?.classList.remove('active');
        prompt?.setAttribute('aria-hidden', 'true');
        this.updateInstallControls();
    }

    dismissInstallPrompt() {
        sessionStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
        this.hideInstallPrompt();
    }

    installManualHint() {
        if (this.isIosDevice()) {
            return 'Нажмите «Поделиться» в Safari, затем «На экран Домой».';
        }
        return 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».';
    }

    updateInstallControls() {
        const button = document.getElementById('profileInstallPwaButton');
        const status = document.getElementById('profilePwaInstallStatus');
        if (!button && !status) return;

        const installed = this.isPwaInstalled();
        if (installed) {
            if (button) {
                button.disabled = true;
                button.textContent = 'Установлено';
            }
            if (status) status.textContent = 'Приложение уже открывается с домашнего экрана.';
            return;
        }

        if (button) {
            button.disabled = false;
            button.textContent = this.deferredInstallPrompt ? 'Установить' : 'Как добавить';
        }
        if (status) {
            status.textContent = this.deferredInstallPrompt
                ? 'Можно установить PulseDesk как отдельное приложение.'
                : this.installManualHint();
        }
    }

    async installPwa(options = {}) {
        if (this.isPwaInstalled()) {
            this.updateInstallControls();
            this.toast('PulseDesk уже установлен', 'info');
            return;
        }
        if (!this.deferredInstallPrompt) {
            sessionStorage.removeItem('pwa_install_dismissed_at');
            this.showInstallPrompt({ force: true });
            this.toast(this.installManualHint(), 'info');
            this.updateInstallControls();
            return;
        }

        const promptEvent = this.deferredInstallPrompt;
        this.deferredInstallPrompt = null;
        promptEvent.prompt();

        try {
            const choice = await promptEvent.userChoice;
            if (choice?.outcome === 'accepted') {
                localStorage.setItem('pwa_install_last_success_at', String(Date.now()));
            } else {
                localStorage.setItem('pwa_install_last_attempt_at', String(Date.now()));
            }
        } catch (error) {
            localStorage.setItem('pwa_install_last_attempt_at', String(Date.now()));
        } finally {
            this.hideInstallPrompt();
            this.updateInstallControls();
        }
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
        if (this.currentPage === 'library') {
            await this.loadProofLibrary();
        }
    }

    pageFromPath(pathname) {
        const cleanPath = String(pathname || '').replace(/\/$/, '') || '/';
        if (cleanPath === '/app') {
            return 'dashboard';
        }
        if (cleanPath === '/proofs') {
            return 'library';
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
        this.setTaskDateBounds(Boolean(task));
        document.getElementById('taskTitle').value = task?.title || '';
        document.getElementById('taskDescription').value = task?.description || '';
        document.getElementById('taskPriority').value = task?.priority || 'medium';
        this.setTaskDueDate(task?.due_date, { defaultIfEmpty: true });
        document.getElementById('taskRecurrence').value = task?.recurrence || 'none';
        this.setFormMessage('taskTitleError', '');
        this.setTaskDueDateError('');
        this.syncPriorityChoice();
        this.renderSubtaskEditor(task?.subtasks || []);
        this.openModal('taskModal');
    }

    bindTaskDatePicker() {
        const input = document.getElementById('taskDueDate');
        const trigger = document.getElementById('taskDueDateButton');
        const popover = document.getElementById('taskDatePicker');
        if (!input || !trigger || !popover) return;

        input.addEventListener('focus', () => this.openTaskDatePicker());
        input.addEventListener('click', () => this.openTaskDatePicker());
        input.addEventListener('input', () => {
            this.taskDatePicker.selectedDate = null;
            this.setTaskDueDateError('');
        });
        input.addEventListener('change', () => this.commitTaskDueInput());
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.commitTaskDueInput({ close: true });
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.openTaskDatePicker({ focusCalendar: true });
            }
        });

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            if (this.taskDatePicker.open) {
                this.closeTaskDatePicker();
            } else {
                this.openTaskDatePicker({ focusCalendar: true });
            }
        });

        popover.addEventListener('click', (event) => this.handleTaskDatePickerClick(event));
        popover.addEventListener('input', (event) => {
            if (event.target.id === 'taskDueTime') {
                this.updateTaskDueTime(event.target.value);
            }
        });
        popover.addEventListener('change', (event) => {
            if (event.target.id === 'taskDueTime') {
                this.updateTaskDueTime(event.target.value);
            }
        });
        popover.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.id === 'taskDueTime') {
                event.preventDefault();
                this.applyTaskDueDate();
            }
        });

        document.addEventListener('click', (event) => {
            const field = document.getElementById('taskDateField');
            if (this.taskDatePicker.open && field && !field.contains(event.target)) {
                this.closeTaskDatePicker();
            }
        });
        window.addEventListener('resize', () => this.positionTaskDatePicker());
        document.addEventListener('scroll', () => this.positionTaskDatePicker(), true);
    }

    openTaskDatePicker(options = {}) {
        const input = document.getElementById('taskDueDate');
        const popover = document.getElementById('taskDatePicker');
        if (!input || !popover) return;

        if (!input.value.trim()) {
            this.setTaskDueDate(null, { defaultIfEmpty: true, render: false });
        } else if (!this.taskDatePicker.selectedDate) {
            const result = window.PulseDeskDateTime.validateDueDate(input.value, { required: false });
            if (result.valid && result.date) {
                this.setTaskDueDate(result.date, { render: false });
            }
        }

        this.taskDatePicker.open = true;
        this.taskDatePicker.viewDate = this.taskDatePicker.selectedDate || this.taskDatePicker.viewDate || new Date();
        popover.hidden = false;
        popover.classList.add('active');
        popover.setAttribute('aria-hidden', 'false');
        input.setAttribute('aria-expanded', 'true');
        this.renderTaskDatePicker();
        window.requestAnimationFrame(() => {
            this.positionTaskDatePicker();
            if (options.focusCalendar) {
                popover.querySelector('.date-picker-day[aria-selected="true"], .date-picker-day:not(:disabled)')?.focus();
            }
        });
    }

    closeTaskDatePicker() {
        if (!this.taskDatePicker?.open) return false;
        const input = document.getElementById('taskDueDate');
        const popover = document.getElementById('taskDatePicker');
        this.taskDatePicker.open = false;
        popover?.classList.remove('active');
        popover?.setAttribute('aria-hidden', 'true');
        if (popover) popover.hidden = true;
        input?.setAttribute('aria-expanded', 'false');
        return true;
    }

    renderTaskDatePicker() {
        const popover = document.getElementById('taskDatePicker');
        if (!popover) return;

        const dateTime = window.PulseDeskDateTime;
        const now = new Date();
        const selectedDate = this.taskDatePicker.selectedDate;
        const viewDate = this.taskDatePicker.viewDate || selectedDate || now;
        const days = dateTime.calendarDays(viewDate, selectedDate, now);
        const presets = dateTime.dueDatePresets(now, selectedDate);
        const selectedTime = dateTime.timeValue(selectedDate || dateTime.defaultDueDate(now));
        const timeMin = selectedDate && dateTime.isSameDay(selectedDate, now) ? dateTime.timeValue(dateTime.startOfMinute(now)) : '';

        popover.innerHTML = `
            <div class="date-picker-content">
                <div class="date-picker-calendar">
                    <div class="date-picker-nav">
                        <button class="date-picker-icon" type="button" data-task-date-action="prev-month" aria-label="Предыдущий месяц">
                            <i class="fas fa-chevron-left" aria-hidden="true"></i>
                        </button>
                        <strong id="taskDatePickerMonth">${this.escape(dateTime.monthTitle(viewDate))}</strong>
                        <button class="date-picker-icon" type="button" data-task-date-action="next-month" aria-label="Следующий месяц">
                            <i class="fas fa-chevron-right" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="date-picker-weekdays" aria-hidden="true">
                        ${dateTime.WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join('')}
                    </div>
                    <div class="date-picker-days" role="grid" aria-labelledby="taskDatePickerMonth">
                        ${days.map((day) => `
                            <button
                                class="date-picker-day${day.outside ? ' is-outside' : ''}${day.weekend ? ' is-weekend' : ''}${day.today ? ' is-today' : ''}${day.selected ? ' is-selected' : ''}"
                                type="button"
                                data-task-date-day="${day.key}"
                                role="gridcell"
                                aria-label="${this.escape(day.ariaLabel)}"
                                aria-selected="${day.selected ? 'true' : 'false'}"
                                ${day.disabled ? 'disabled' : ''}
                            >${day.label}</button>
                        `).join('')}
                    </div>
                    <label class="date-picker-time" for="taskDueTime">
                        <span><i class="fas fa-clock" aria-hidden="true"></i> Время</span>
                        <input id="taskDueTime" type="time" step="60" value="${selectedTime}" ${timeMin ? `min="${timeMin}"` : ''}>
                    </label>
                </div>
                <div class="date-picker-presets" aria-label="Быстрый выбор срока">
                    ${presets.map((preset) => `
                        <button class="date-picker-preset" type="button" data-task-date-preset="${preset.id}">
                            <strong>${this.escape(preset.title)}</strong>
                            <span>${this.escape(preset.detail)}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="date-picker-actions">
                <button class="btn btn-secondary" type="button" data-task-date-action="close">Закрыть</button>
                <button class="btn btn-primary" type="button" data-task-date-action="apply">Готово</button>
            </div>
        `;
    }

    handleTaskDatePickerClick(event) {
        const dayButton = event.target.closest('[data-task-date-day]');
        if (dayButton) {
            event.preventDefault();
            this.selectTaskDueDay(dayButton.dataset.taskDateDay);
            return;
        }

        const presetButton = event.target.closest('[data-task-date-preset]');
        if (presetButton) {
            event.preventDefault();
            this.selectTaskDuePreset(presetButton.dataset.taskDatePreset);
            return;
        }

        const actionButton = event.target.closest('[data-task-date-action]');
        if (!actionButton) return;
        event.preventDefault();

        const action = actionButton.dataset.taskDateAction;
        if (action === 'prev-month') this.shiftTaskDateMonth(-1);
        if (action === 'next-month') this.shiftTaskDateMonth(1);
        if (action === 'close') this.closeTaskDatePicker();
        if (action === 'apply') this.applyTaskDueDate();
    }

    shiftTaskDateMonth(direction) {
        const base = this.taskDatePicker.viewDate || this.taskDatePicker.selectedDate || new Date();
        this.taskDatePicker.viewDate = new Date(base.getFullYear(), base.getMonth() + direction, 1);
        this.renderTaskDatePicker();
        window.requestAnimationFrame(() => this.positionTaskDatePicker());
    }

    selectTaskDueDay(key) {
        const dateTime = window.PulseDeskDateTime;
        const day = dateTime.parseDateKey(key);
        if (!day) return;

        const today = dateTime.startOfDay(new Date());
        if (dateTime.startOfDay(day).getTime() < today.getTime()) return;

        let dueDate = dateTime.mergeDateAndTime(day, this.taskDatePicker.selectedDate || dateTime.defaultDueDate());
        if (dateTime.compareByMinute(dueDate, new Date()) < 0 && dateTime.isSameDay(dueDate, new Date())) {
            dueDate = dateTime.startOfMinute(new Date());
        }

        this.setTaskDueDate(dueDate, { render: false });
        this.taskDatePicker.viewDate = dueDate;
        this.renderTaskDatePicker();
        this.validateTaskDueDate({ required: true, silent: true });
        window.requestAnimationFrame(() => {
            this.positionTaskDatePicker();
            document.getElementById('taskDueTime')?.focus();
        });
    }

    selectTaskDuePreset(id) {
        const preset = window.PulseDeskDateTime
            .dueDatePresets(new Date(), this.taskDatePicker.selectedDate)
            .find((item) => item.id === id);
        if (!preset) return;
        this.setTaskDueDate(preset.date, { render: false });
        this.closeTaskDatePicker();
    }

    updateTaskDueTime(value) {
        const dateTime = window.PulseDeskDateTime;
        const parsedTime = dateTime.parseTimeValue(value);
        if (!parsedTime) return;

        const base = this.taskDatePicker.selectedDate || dateTime.defaultDueDate();
        const dueDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), parsedTime.hours, parsedTime.minutes, 0, 0);
        this.setTaskDueDate(dueDate, { render: false });

        const validation = this.validateTaskDueDate({ required: true, silent: true });
        this.setTaskDueDateError(validation.valid ? '' : validation.message);
    }

    applyTaskDueDate() {
        const validation = this.validateTaskDueDate({ required: true });
        if (!validation.valid) return;
        this.setTaskDueDate(validation.date, { render: false });
        this.closeTaskDatePicker();
    }

    commitTaskDueInput(options = {}) {
        const validation = this.validateTaskDueDate({ required: true, silent: options.silent });
        if (!validation.valid) {
            if (options.close) this.openTaskDatePicker();
            return validation;
        }
        this.setTaskDueDate(validation.date, { render: this.taskDatePicker.open });
        if (options.close) this.closeTaskDatePicker();
        return validation;
    }

    validateTaskDueDate(options = {}) {
        const input = document.getElementById('taskDueDate');
        const value = this.taskDatePicker.selectedDate || input?.value || '';
        const validation = window.PulseDeskDateTime.validateDueDate(value, {
            required: options.required !== false,
        });
        if (!options.silent) {
            this.setTaskDueDateError(validation.valid ? '' : validation.message);
        }
        return validation;
    }

    setTaskDueDate(value, options = {}) {
        const dateTime = window.PulseDeskDateTime;
        const input = document.getElementById('taskDueDate');
        let date = dateTime.normalizeDateTime(value);
        if (!date && options.defaultIfEmpty) {
            date = dateTime.defaultDueDate();
        }

        this.taskDatePicker.selectedDate = date;
        this.taskDatePicker.viewDate = date || this.taskDatePicker.viewDate || new Date();

        if (input) {
            input.value = date ? dateTime.formatDisplayDateTime(date) : '';
            input.dataset.iso = date ? date.toISOString() : '';
        }
        this.setTaskDueDateError('');

        if (options.render && this.taskDatePicker.open) {
            this.renderTaskDatePicker();
            window.requestAnimationFrame(() => this.positionTaskDatePicker());
        }
    }

    setTaskDueDateError(message) {
        const input = document.getElementById('taskDueDate');
        this.setFormMessage('taskDueDateError', message, message ? 'error' : '');
        input?.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    positionTaskDatePicker() {
        if (!this.taskDatePicker?.open) return;
        const popover = document.getElementById('taskDatePicker');
        const control = document.querySelector('#taskDateField .date-input-shell');
        if (!popover || !control || popover.hidden) return;

        if (window.matchMedia('(max-width: 640px)').matches) {
            popover.style.removeProperty('top');
            popover.style.removeProperty('left');
            popover.style.removeProperty('width');
            return;
        }

        const rect = control.getBoundingClientRect();
        const width = Math.min(640, window.innerWidth - 32);
        const height = popover.offsetHeight || 420;
        const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
        let top = rect.bottom + 8;
        if (top + height > window.innerHeight - 16) {
            top = Math.max(16, rect.top - height - 8);
        }

        popover.style.width = `${width}px`;
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
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

        const dueValidation = this.validateTaskDueDate({ required: true });
        if (!dueValidation.valid) {
            this.toast(dueValidation.message, 'error');
            return;
        }
        const dueDate = dueValidation.date;
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
        const requiresProof = this.habitRequiresProof(habit);
        const proofLabel = this.proofTypeLabel(habit.proof_type);
        const action = requiresProof && !habit.checked_today ? 'habit-proof' : 'habit-toggle';
        const actionLabel = requiresProof
            ? (habit.checked_today ? 'Подтверждено' : 'Добавить подтверждение')
            : (habit.checked_today ? 'Отмечено' : 'Отметить');
        return `
            <article class="list-item" data-id="${habit.id}">
                <span class="habit-dot" style="--habit-color: ${color}"></span>
                <div class="item-body">
                    <h3>${this.escape(habit.title)}</h3>
                    ${habit.description && !compact ? `<p>${this.escape(habit.description)}</p>` : ''}
                    <div class="item-meta">
                        <span><i class="fas fa-fire" aria-hidden="true"></i> ${habit.streak || 0} дней</span>
                        <span>${Math.round(habit.weekly_rate || 0)}% за неделю</span>
                        ${requiresProof ? `<span class="proof-badge ${habit.checked_today ? 'verified' : ''}"><i class="fas ${habit.checked_today ? 'fa-circle-check' : 'fa-lock'}" aria-hidden="true"></i> ${this.escape(proofLabel)}</span>` : ''}
                    </div>
                </div>
                <button class="btn ${habit.checked_today ? 'btn-secondary' : 'btn-primary'} compact-btn proof-action-btn" type="button" data-action="${action}" data-id="${habit.id}">
                    ${actionLabel}
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
        document.getElementById('habitProofType').value = habit?.proof_type || 'none';
        document.getElementById('habitProofPrompt').value = habit?.proof_prompt || '';
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
            proof_type: document.getElementById('habitProofType').value,
            proof_prompt: document.getElementById('habitProofPrompt').value.trim(),
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

    openProofModal(id) {
        const habit = this.habits.find((item) => String(item.id) === String(id));
        if (!habit) return;
        this.proofHabit = habit;
        const initialType = habit.proof_type === 'photo_or_audio' ? 'photo' : habit.proof_type;
        this.setText('proofHabitTitle', habit.title);
        this.setText('proofRequirement', this.proofTypeLabel(habit.proof_type));
        this.setText('proofPromptText', habit.proof_prompt || 'Добавьте подтверждение, чтобы отметить привычку выполненной.');
        document.getElementById('proofNote').value = '';
        document.getElementById('proofFile').value = '';
        this.recordedAudioFile = null;
        this.setProofType(initialType || 'note');
        this.renderProofPreview();
        this.openModal('proofModal');
    }

    setProofType(type) {
        this.proofType = type;
        const allowsChoice = this.proofHabit?.proof_type === 'photo_or_audio';
        document.getElementById('proofTypeSection')?.classList.toggle('hidden', !allowsChoice);
        document.querySelectorAll('[data-proof-choice]').forEach((button) => {
            button.classList.toggle('active', button.dataset.proofChoice === type);
        });

        const isNote = type === 'note';
        const isAudio = type === 'audio';
        document.getElementById('proofNoteSection')?.classList.toggle('hidden', !isNote);
        document.getElementById('proofFileSection')?.classList.toggle('hidden', isNote);
        const fileInput = document.getElementById('proofFile');
        if (fileInput) {
            fileInput.accept = isAudio ? 'audio/webm,audio/mpeg,audio/mp3,audio/wav' : 'image/jpeg,image/png,image/webp';
        }
        document.getElementById('audioRecorder')?.classList.toggle('hidden', !isAudio);
        this.renderProofPreview();
    }

    renderProofPreview() {
        const preview = document.getElementById('proofPreview');
        if (!preview) return;
        const file = this.recordedAudioFile || document.getElementById('proofFile')?.files?.[0];
        if (!file) {
            preview.innerHTML = '<p>Файл еще не выбран.</p>';
            return;
        }
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('image/')) {
            preview.innerHTML = `<img src="${url}" alt="Превью подтверждения">`;
        } else {
            preview.innerHTML = `<audio controls src="${url}"></audio><p>${this.escape(file.name)}</p>`;
        }
    }

    async startAudioRecording() {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            this.toast('Запись с микрофона недоступна в этом браузере', 'error');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            });
            this.mediaRecorder.addEventListener('stop', () => {
                stream.getTracks().forEach((track) => track.stop());
                const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.recordedAudioFile = new File([blob], `habit-proof-${Date.now()}.webm`, { type: 'audio/webm' });
                this.renderProofPreview();
            });
            this.mediaRecorder.start();
            document.getElementById('startAudioRecord').disabled = true;
            document.getElementById('stopAudioRecord').disabled = false;
        } catch (error) {
            this.toast('Не удалось получить доступ к микрофону', 'error');
        }
    }

    stopAudioRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        document.getElementById('startAudioRecord').disabled = false;
        document.getElementById('stopAudioRecord').disabled = true;
    }

    async saveHabitProof() {
        if (!this.proofHabit) return;
        const formData = new FormData();
        const today = this.todayDateValue();
        formData.set('completion_date', today);
        formData.set('type', this.proofType);

        if (this.proofType === 'note') {
            const note = document.getElementById('proofNote').value.trim();
            if (!note) {
                this.toast('Добавьте заметку для подтверждения', 'error');
                return;
            }
            formData.set('note', note);
        } else {
            const file = this.recordedAudioFile || document.getElementById('proofFile')?.files?.[0];
            if (!file) {
                this.toast(this.proofType === 'audio' ? 'Добавьте аудио' : 'Добавьте фото', 'error');
                return;
            }
            formData.set('file', file);
        }

        const button = document.getElementById('proofSubmitButton');
        this.setLoading(button, true);
        try {
            await this.request(`/api/habits/${this.proofHabit.id}/proofs`, {
                method: 'POST',
                body: formData,
            });
            this.closeModal();
            this.toast('Привычка подтверждена', 'success');
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

    onboardingSteps() {
        return [
            {
                icon: 'fa-bolt',
                title: 'Добро пожаловать в PulseDesk',
                text: 'Управляйте задачами, привычками и режимом сна в одном месте.',
                examples: ['Один рабочий ритм для фокуса, здоровья и регулярности.'],
                action: 'Начать',
            },
            {
                icon: 'fa-list-check',
                title: 'Задачи без хаоса',
                text: 'Создавайте задачи, ставьте дедлайны, добавляйте чеклист и запускайте Pomodoro прямо из карточки.',
                examples: ['Дедлайн с временем', 'Подзадачи внутри задачи', 'Фильтры: сегодня, завтра, неделя'],
                action: 'Далее',
            },
            {
                icon: 'fa-repeat',
                title: 'Привычки с доказательствами',
                text: 'Отмечайте ежедневный прогресс обычной галочкой или требуйте proof: заметку, фото либо аудио.',
                examples: ['Прочитать химию -> записать пересказ', 'Тренировка -> прикрепить фото'],
                action: 'Далее',
            },
            {
                icon: 'fa-moon',
                title: 'Сон как часть продуктивности',
                text: 'Настройте режим сна, записывайте ночи, смотрите Sleep Score, статистику и рекомендации.',
                examples: ['Цель сна', 'Журнал записей', 'Подсказки по регулярности'],
                action: 'Далее',
            },
            {
                icon: 'fa-compass',
                title: 'Вы готовы',
                text: 'Переключайтесь через боковое меню или нижнюю навигацию на телефоне. Повторить обучение можно в профиле.',
                examples: ['Начните с одной задачи и одной привычки на сегодня.'],
                action: 'Перейти в приложение',
            },
        ];
    }

    maybeOpenOnboarding() {
        const completed = this.currentUser?.onboarding_completed;
        const localCompleted = localStorage.getItem('onboarding_completed') === 'true';
        if (completed === false || (completed === undefined && !localCompleted)) {
            window.setTimeout(() => this.openOnboarding(false), 250);
        }
    }

    openOnboarding(manual = false) {
        this.onboardingStep = 0;
        this.renderOnboarding();
        const layer = document.getElementById('onboardingLayer');
        layer?.classList.add('active');
        layer?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        if (manual) {
            this.toast('Обучение открыто', 'info');
        }
    }

    renderOnboarding() {
        const steps = this.onboardingSteps();
        const index = Math.max(0, Math.min(this.onboardingStep, steps.length - 1));
        this.onboardingStep = index;
        const step = steps[index];

        this.setText('onboardingStepCounter', `Шаг ${index + 1} из ${steps.length}`);
        this.setText('onboardingTitle', step.title);
        this.setText('onboardingText', step.text);
        this.setText('onboardingNext', step.action);
        document.getElementById('onboardingBack').disabled = index === 0;

        const visual = document.getElementById('onboardingVisual');
        if (visual) {
            visual.innerHTML = `<span><i class="fas ${step.icon}" aria-hidden="true"></i></span>`;
        }

        const examples = document.getElementById('onboardingExamples');
        if (examples) {
            examples.innerHTML = step.examples.map((item) => `<span>${this.escape(item)}</span>`).join('');
        }

        const dots = document.getElementById('onboardingDots');
        if (dots) {
            dots.innerHTML = steps.map((_, dotIndex) => `
                <button class="onboarding-dot ${dotIndex === index ? 'active' : ''}" type="button" data-onboarding-step="${dotIndex}" aria-label="Шаг ${dotIndex + 1}"></button>
            `).join('');
        }
    }

    nextOnboardingStep() {
        const lastIndex = this.onboardingSteps().length - 1;
        if (this.onboardingStep >= lastIndex) {
            this.completeOnboarding();
            return;
        }
        this.onboardingStep += 1;
        this.renderOnboarding();
    }

    previousOnboardingStep() {
        if (this.onboardingStep === 0) return;
        this.onboardingStep -= 1;
        this.renderOnboarding();
    }

    async completeOnboarding() {
        const layer = document.getElementById('onboardingLayer');
        layer?.classList.remove('active');
        layer?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        localStorage.setItem('onboarding_completed', 'true');
        if (this.currentUser) {
            this.currentUser.onboarding_completed = true;
            localStorage.setItem('user', JSON.stringify(this.currentUser));
        }
        try {
            const updated = await this.request('/api/user/onboarding', {
                method: 'PATCH',
                body: JSON.stringify({ completed: true }),
            });
            this.currentUser = { ...this.currentUser, ...updated };
            localStorage.setItem('user', JSON.stringify(this.currentUser));
        } catch (error) {
            this.toast('Не удалось сохранить статус обучения, повторю локально', 'error');
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

    async loadProofLibrary(options = {}) {
        const container = document.getElementById('proofLibraryList');
        if (!container) return;
        if (this.proofLibraryLoading) return;

        const append = Boolean(options.append);
        const nextPage = append ? (this.proofLibrary?.page || 1) + 1 : 1;
        this.proofLibraryLoading = true;
        this.setProofLoadMoreState(true);
        if (!append) {
            container.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-row"></div>').join('');
        }

        const params = new URLSearchParams({ page: String(nextPage), limit: '24' });
        if (this.proofFilter && this.proofFilter !== 'all') {
            params.set('type', this.proofFilter);
        }
        const dateFrom = document.getElementById('proofDateFrom')?.value;
        const dateTo = document.getElementById('proofDateTo')?.value;
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        this.syncProofDateReset();

        try {
            const response = await this.request(`/api/proofs?${params.toString()}`);
            if (append) {
                const existing = this.proofLibrary?.items || [];
                const known = new Set(existing.map((item) => String(item.id)));
                const incoming = (response.items || []).filter((item) => !known.has(String(item.id)));
                this.proofLibrary = { ...response, items: existing.concat(incoming) };
            } else {
                this.proofLibrary = response;
            }
            this.renderProofLibrary();
        } catch (error) {
            if (append) {
                this.toast(error.message, 'error');
            } else {
                container.innerHTML = this.emptyState('fa-images', 'Не удалось загрузить библиотеку', error.message);
            }
        } finally {
            this.proofLibraryLoading = false;
            this.setProofLoadMoreState(false);
        }
    }

    renderProofLibrary() {
        const container = document.getElementById('proofLibraryList');
        if (!container) return;
        this.renderProofLibraryStats();
        const allItems = this.proofLibrary?.items || [];
        const items = this.filteredProofItems(allItems);
        if (!items.length) {
            container.innerHTML = this.libraryEmptyState(allItems.length);
            this.setProofLoadMoreState(false);
            return;
        }

        const groups = this.groupProofItemsByDate(items);
        container.innerHTML = groups.map((group) => `
            <section class="proof-date-group" aria-label="${group.label}">
                <h2>${group.label}</h2>
                <div class="proof-date-grid">
                    ${group.items.map((item) => this.renderProofCard(item)).join('')}
                </div>
            </section>
        `).join('');
        this.setProofLoadMoreState(false);
        this.loadProofMedia();
    }

    setProofLoadMoreState(loading) {
        const button = document.getElementById('proofLoadMore');
        if (!button) return;
        const hasMore = Boolean(this.proofLibrary?.has_more);
        button.classList.toggle('hidden', !hasMore);
        button.disabled = Boolean(loading);
        button.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Загрузка'
            : '<i class="fas fa-chevron-down" aria-hidden="true"></i> Показать ещё';
    }

    renderProofCard(item) {
        const date = this.formatDate(item.completion_date);
        const label = this.libraryProofTypeLabel(item.type);
        const icon = item.type === 'photo' ? 'fa-image' : item.type === 'audio' ? 'fa-wave-square' : 'fa-note-sticky';
        const fileLabel = this.escape(item.file_name || this.defaultProofFileLabel(item.type));
        const duration = this.proofAudioDurations.get(String(item.id)) || this.proofAudioDurations.get(item.id);
        const durationText = item.type === 'audio' ? this.formatDuration(duration) : '';
        const title = this.escape(item.habit_title);
        const menuLabel = item.type === 'audio' ? 'Прослушать' : 'Открыть';
        const canDownload = item.type === 'photo' || item.type === 'audio' || item.type === 'note';
        const downloadAction = canDownload
            ? `<button type="button" data-action="proof-download" data-id="${item.id}"><i class="fas fa-download" aria-hidden="true"></i> Скачать</button>`
            : '';
        const header = `
            <div class="proof-card-header">
                <span class="proof-type-badge">${label}</span>
                <details class="proof-action-menu">
                    <summary aria-label="Действия с подтверждением"><i class="fas fa-ellipsis" aria-hidden="true"></i></summary>
                    <div class="proof-menu-panel">
                        <button type="button" data-action="proof-preview" data-id="${item.id}"><i class="fas fa-up-right-and-down-left-from-center" aria-hidden="true"></i> ${menuLabel}</button>
                        ${downloadAction}
                        <button class="danger" type="button" data-action="proof-delete" data-id="${item.id}"><i class="fas fa-trash" aria-hidden="true"></i> Удалить</button>
                    </div>
                </details>
            </div>
        `;

        if (item.type === 'photo') {
            return `
                <article class="proof-card proof-photo-card">
                    ${header}
                    <button class="proof-thumb" type="button" data-action="proof-preview" data-id="${item.id}" aria-label="Открыть фото">
                        <img loading="lazy" data-proof-media="${item.id}" alt="${title}">
                    </button>
                    <div class="proof-card-body">
                        <strong><i class="fas ${icon}" aria-hidden="true"></i> ${title}</strong>
                        <div class="proof-card-meta">
                            <span><i class="fas fa-calendar-day" aria-hidden="true"></i>${date}</span>
                            <small>${fileLabel}</small>
                        </div>
                    </div>
                </article>
            `;
        }

        if (item.type === 'note') {
            return `
                <article class="proof-card proof-note-card">
                    ${header}
                    <button class="proof-note-preview" type="button" data-action="proof-preview" data-id="${item.id}" aria-label="Открыть заметку">
                        <i class="fas ${icon}" aria-hidden="true"></i>
                        <span>${this.escape(item.text_note || 'Заметка без текста')}</span>
                    </button>
                    <div class="proof-card-body">
                        <strong>${title}</strong>
                        <div class="proof-card-meta">
                            <span><i class="fas fa-calendar-day" aria-hidden="true"></i>${date}</span>
                            <small>Текстовая заметка</small>
                        </div>
                    </div>
                </article>
            `;
        }

        return `
            <article class="proof-card proof-audio-card">
                ${header}
                <div class="proof-card-body">
                    <strong><i class="fas ${icon}" aria-hidden="true"></i> ${title}</strong>
                    <div class="proof-card-meta">
                        <span><i class="fas fa-calendar-day" aria-hidden="true"></i>${date}</span>
                        <small>${fileLabel}</small>
                        <small id="proofDuration-${item.id}" class="proof-duration">${durationText || 'Длительность: загрузка'}</small>
                    </div>
                    <div class="proof-audio-shell">
                        <audio controls preload="metadata" data-proof-media="${item.id}" data-proof-duration="${item.id}"></audio>
                    </div>
                </div>
            </article>
        `;
    }

    renderProofLibraryStats() {
        const stats = document.getElementById('proofLibraryStats');
        if (!stats) return;
        const items = this.proofLibrary?.items || [];
        const count = (type) => items.filter((item) => item.type === type).length;
        const cards = [
            ['Всего', items.length, 'fa-layer-group'],
            ['Фото', count('photo'), 'fa-image'],
            ['Аудио', count('audio'), 'fa-wave-square'],
            ['Заметки', count('note'), 'fa-note-sticky'],
        ];
        stats.innerHTML = cards.map(([label, value, icon]) => `
            <article class="library-stat-card">
                <i class="fas ${icon}" aria-hidden="true"></i>
                <div>
                    <strong>${value}</strong>
                    <span>${label}</span>
                </div>
            </article>
        `).join('');
    }

    filteredProofItems(items) {
        const query = (document.getElementById('proofSearch')?.value || '').trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => {
            const haystack = [
                item.habit_title,
                item.file_name,
                item.text_note,
                this.libraryProofTypeLabel(item.type),
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }

    groupProofItemsByDate(items) {
        const buckets = [
            { key: 'today', label: 'Сегодня', items: [] },
            { key: 'yesterday', label: 'Вчера', items: [] },
            { key: 'week', label: 'Эта неделя', items: [] },
            { key: 'earlier', label: 'Ранее', items: [] },
        ];
        const now = new Date();
        const today = this.startOfLocalDay(now);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const weekStart = new Date(today);
        const day = weekStart.getDay() || 7;
        weekStart.setDate(weekStart.getDate() - day + 1);

        items.forEach((item) => {
            const date = this.startOfLocalDay(new Date(item.completion_date));
            if (Number.isNaN(date.getTime())) {
                buckets[3].items.push(item);
            } else if (date.getTime() === today.getTime()) {
                buckets[0].items.push(item);
            } else if (date.getTime() === yesterday.getTime()) {
                buckets[1].items.push(item);
            } else if (date >= weekStart) {
                buckets[2].items.push(item);
            } else {
                buckets[3].items.push(item);
            }
        });
        return buckets.filter((bucket) => bucket.items.length);
    }

    startOfLocalDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    defaultProofFileLabel(type) {
        return {
            photo: 'Фото подтверждение',
            audio: 'Аудио подтверждение',
            note: 'Текстовая заметка',
        }[type] || 'Подтверждение';
    }

    syncProofDateReset() {
        const hasFilters = Boolean(document.getElementById('proofDateFrom')?.value || document.getElementById('proofDateTo')?.value);
        document.getElementById('proofDateReset')?.classList.toggle('hidden', !hasFilters);
    }

    resetProofDateFilters() {
        const from = document.getElementById('proofDateFrom');
        const to = document.getElementById('proofDateTo');
        if (from) from.value = '';
        if (to) to.value = '';
        this.syncProofDateReset();
        this.loadProofLibrary({ reset: true });
    }

    libraryEmptyState(hasBaseItems = false) {
        const query = (document.getElementById('proofSearch')?.value || '').trim();
        const filterLabel = this.libraryProofTypeLabel(this.proofFilter);
        const hasDates = Boolean(document.getElementById('proofDateFrom')?.value || document.getElementById('proofDateTo')?.value);
        let title = 'Пока нет подтверждений';
        let text = 'Добавьте привычку с заметкой, фото или аудио, и она появится здесь.';
        if (query) {
            title = 'Ничего не найдено';
            text = `По запросу "${this.escape(query)}" нет совпадений в названиях привычек, файлах и заметках.`;
        } else if (hasBaseItems) {
            title = `Нет элементов в фильтре "${filterLabel}"`;
            text = 'Попробуйте другой тип подтверждения или измените даты.';
        } else if (this.proofFilter !== 'all') {
            title = `${filterLabel} пока нет`;
            text = 'Когда появятся подтверждения этого типа, они будут показаны здесь.';
        } else if (hasDates) {
            title = 'За выбранные даты пусто';
            text = 'Измените период или сбросьте фильтр дат.';
        }
        return `
            <div class="empty-state library-empty-state">
                <i class="fas fa-images" aria-hidden="true"></i>
                <h3>${title}</h3>
                <p>${text}</p>
                <button class="btn btn-primary" type="button" data-page-jump="habits">
                    <i class="fas fa-repeat" aria-hidden="true"></i>
                    Перейти к привычкам
                </button>
            </div>
        `;
    }

    proofFileURL(item) {
        return window.PulseDeskAPI.apiUrl(`/api/habits/${item.habit_id}/proofs/${item.id}/file`);
    }

    async fetchProofMedia(item) {
        if (this.proofMediaURLs.has(item.id)) {
            return this.proofMediaURLs.get(item.id);
        }
        const headers = new Headers();
        const token = localStorage.getItem('token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        const response = await fetch(this.proofFileURL(item), { headers });
        if (!response.ok) {
            throw new Error(`Failed to load proof media: ${response.status}`);
        }
        const url = URL.createObjectURL(await response.blob());
        this.proofMediaURLs.set(item.id, url);
        return url;
    }

    async loadProofMedia() {
        const items = this.proofLibrary?.items || [];
        await Promise.all(items.map(async (item) => {
            if (item.type === 'note') return;
            const elements = document.querySelectorAll(`[data-proof-media="${item.id}"]`);
            if (!elements.length) return;
            try {
                const url = await this.fetchProofMedia(item);
                elements.forEach((element) => {
                    element.src = url;
                    if (element.tagName === 'AUDIO') element.load();
                });
            } catch (error) {
                elements.forEach((element) => {
                    element.replaceWith(this.proofMediaErrorNode());
                });
            }
        }));
    }

    proofMediaErrorNode() {
        const node = document.createElement('div');
        node.className = 'proof-media-error';
        node.textContent = 'Не удалось загрузить файл';
        return node;
    }

    async openProofPreview(id) {
        const item = (this.proofLibrary?.items || []).find((proof) => String(proof.id) === String(id));
        if (!item) return;
        this.activeProofPreviewID = item.id;
        this.setText('proofPreviewTitle', item.habit_title);
        this.setText('proofPreviewMeta', `${this.libraryProofTypeLabel(item.type)} · ${this.formatDate(item.completion_date)}`);
        const frame = document.getElementById('proofPreviewFrame');
        if (frame) {
            frame.innerHTML = '<div class="skeleton-row"></div>';
            this.openModal('proofPreviewModal');
            try {
                if (item.type === 'note') {
                    frame.innerHTML = `<article class="proof-note-modal"><p>${this.escape(item.text_note || 'Заметка без текста')}</p></article>`;
                } else {
                    const mediaURL = await this.fetchProofMedia(item);
                    if (item.type === 'photo') {
                        frame.innerHTML = `<img src="${mediaURL}" alt="${this.escape(item.habit_title)}">`;
                    } else {
                        frame.innerHTML = `<audio controls autoplay src="${mediaURL}"></audio>`;
                    }
                }
            } catch (error) {
                frame.innerHTML = '<div class="proof-media-error">Не удалось загрузить файл</div>';
            }
        }
    }

    async downloadProof(id) {
        const item = (this.proofLibrary?.items || []).find((proof) => String(proof.id) === String(id));
        if (!item) return;
        try {
            let url;
            let filename = this.safeDownloadName(item.file_name || `${item.habit_title}-${item.type}`);
            if (item.type === 'note') {
                const blob = new Blob([item.text_note || ''], { type: 'text/plain;charset=utf-8' });
                url = URL.createObjectURL(blob);
                filename = `${filename || 'proof-note'}.txt`;
            } else {
                url = await this.fetchProofMedia(item);
                filename = filename || `proof-${item.id}`;
            }
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            if (item.type === 'note') {
                window.setTimeout(() => URL.revokeObjectURL(url), 0);
            }
        } catch (error) {
            this.toast('Не удалось скачать подтверждение', 'error');
        }
    }

    async deleteProof(id) {
        if (!(await this.confirm('Удалить подтверждение? Это действие нельзя отменить.', 'Удалить'))) return;
        try {
            await this.request(`/api/proofs/${id}`, { method: 'DELETE' });
            const mediaURL = this.proofMediaURLs.get(Number(id)) || this.proofMediaURLs.get(id);
            if (mediaURL) {
                URL.revokeObjectURL(mediaURL);
                this.proofMediaURLs.delete(Number(id));
                this.proofMediaURLs.delete(id);
            }
            this.proofLibrary.items = (this.proofLibrary.items || []).filter((item) => String(item.id) !== String(id));
            this.proofLibrary.total = Math.max(0, (this.proofLibrary.total || 0) - 1);
            if (String(this.activeProofPreviewID) === String(id)) {
                this.activeProofPreviewID = null;
                this.closeModal(false);
            }
            this.toast('Файл удален', 'success');
            this.renderProofLibrary();
        } catch (error) {
            this.toast(error.message, 'error');
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
                        <button class="icon-button" type="button" data-action="admin-sessions" data-id="${user.id}" aria-label="Показать устройства">
                            <i class="fas fa-laptop" aria-hidden="true"></i>
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

    async loadAdminSessions(id) {
        const user = (this.adminUsers || []).find((item) => String(item.id) === String(id));
        const list = document.getElementById('adminSessionsList');
        if (!list || !user) return;
        this.setText('adminSessionsHint', `${user.email}`);
        list.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton-row"></div>').join('');
        try {
            const sessions = await this.request(`/api/admin/users/${id}/sessions`);
            if (!sessions?.length) {
                list.innerHTML = this.emptyState('fa-laptop', 'Входов пока нет', 'Сессии появятся после следующего входа пользователя.');
                return;
            }
            list.innerHTML = sessions.map((session) => `
                <article class="session-card">
                    <span class="session-icon"><i class="fas ${session.device_type === 'mobile' ? 'fa-mobile-screen' : 'fa-display'}" aria-hidden="true"></i></span>
                    <div>
                        <strong>${this.escape(session.browser)} / ${this.escape(session.os)}</strong>
                        <span>${this.escape(session.ip || 'ip скрыт')} · ${this.formatDateTime(session.last_active_at)}</span>
                        <small>${this.escape(session.user_agent || 'Unknown')}</small>
                    </div>
                </article>
            `).join('');
        } catch (error) {
            list.innerHTML = this.emptyState('fa-triangle-exclamation', 'Не удалось загрузить сессии', error.message);
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
        document.querySelectorAll('.user-library-link').forEach((item) => {
            item.classList.toggle('hidden', this.currentUser.role === 'admin');
        });
        document.querySelectorAll('.admin-library-link').forEach((item) => {
            item.classList.toggle('hidden', this.currentUser.role !== 'admin');
        });
        document.body.classList.toggle('has-admin', this.currentUser.role === 'admin');
        this.updateInstallControls();
    }

    handleActionClick(event) {
        const jump = event.target.closest('[data-page-jump]');
        if (jump) {
            this.showPage(jump.dataset.pageJump);
            return;
        }

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
            'habit-proof': () => this.openProofModal(id),
            'habit-edit': () => this.editHabit(id),
            'habit-delete': () => this.deleteHabit(id),
            'sleep-edit': () => this.editSleepLog(id),
            'sleep-delete': () => this.deleteSleepLog(id),
            'admin-status': () => this.updateAdminStatus(id, button.dataset.disabled === 'true'),
            'admin-sessions': () => this.loadAdminSessions(id),
            'admin-delete': () => this.deleteAdminUser(id, button.dataset.name, button.dataset.email),
            'proof-preview': () => this.openProofPreview(id),
            'proof-download': () => this.downloadProof(id),
            'proof-delete': () => this.deleteProof(id),
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
        this.closeTaskDatePicker();
        layer?.classList.remove('active');
        layer?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('active'));
        document.querySelectorAll('.modal .btn.is-loading').forEach((button) => this.setLoading(button, false));
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.editingTask = null;
        this.editingHabit = null;
        this.proofHabit = null;
        this.recordedAudioFile = null;
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
        const baseClass = element.classList.contains('field-message') ? 'field-message' : 'form-message';
        element.className = `${baseClass}${type ? ` ${type}` : ''}`;
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

    setTaskDateBounds(editing = false) {
        const input = document.getElementById('taskDueDate');
        if (!input) return;
        input.removeAttribute('min');
        input.removeAttribute('max');
        input.removeAttribute('required');
        if (!input.value) {
            this.setTaskDueDate(null, { defaultIfEmpty: !editing, render: false });
        }
    }

    toast(message, type = 'info') {
        window.PulseDeskUI.toast(message, type);
    }

    emptyState(icon, title, text) {
        return window.PulseDeskUI.emptyState(icon, title, text);
    }

    setText(id, value) {
        window.PulseDeskUI.setText(id, value);
    }

    escape(value) {
        return window.PulseDeskUI.escapeHTML(value);
    }

    safeColor(value) {
        return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#4f46e5';
    }

    safeDownloadName(value) {
        return String(value || '')
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
            .replace(/\s+/g, ' ')
            .slice(0, 120);
    }

    habitRequiresProof(habit) {
        return habit?.proof_type && habit.proof_type !== 'none';
    }

    proofTypeLabel(type) {
        return {
            note: 'Нужна заметка',
            photo: 'Нужно фото',
            audio: 'Нужно аудио',
            photo_or_audio: 'Нужно фото или аудио',
            none: 'Обычная галочка',
        }[type || 'none'] || 'Обычная галочка';
    }

    libraryProofTypeLabel(type) {
        return {
            all: 'Все',
            photo: 'Фото',
            audio: 'Аудио',
            note: 'Заметки',
        }[type] || 'Файл';
    }

    formatDuration(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) return '';
        const rounded = Math.round(seconds);
        const minutes = Math.floor(rounded / 60);
        const rest = String(rounded % 60).padStart(2, '0');
        return `Длительность: ${minutes}:${rest}`;
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
        return window.PulseDeskDateTime.formatDisplayDateTime(value) || '-';
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
        if (!value) return '';
        return window.PulseDeskDateTime.formatDisplayDateTime(value);
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

