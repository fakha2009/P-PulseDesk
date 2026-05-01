class AuthManager {
    constructor() {
        this.init();
    }

    init() {
        this.applyTheme(localStorage.getItem('theme') || 'light');
        this.bindEvents();
        this.verifyExistingToken();
    }

    bindEvents() {
        document.querySelectorAll('[data-auth-tab]').forEach((button) => {
            button.addEventListener('click', () => this.switchTab(button.dataset.authTab));
        });

        document.getElementById('authThemeToggle')?.addEventListener('click', () => {
            const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
            this.applyTheme(current === 'dark' ? 'light' : 'dark', true);
        });

        document.querySelectorAll('.password-toggle').forEach((button) => {
            button.addEventListener('click', () => this.togglePassword(button));
        });

        document.getElementById('registerPassword')?.addEventListener('input', (event) => {
            this.updatePasswordRules(event.target.value);
        });

        document.getElementById('loginFormElement')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.login(event.currentTarget);
        });

        document.getElementById('registerFormElement')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.register(event.currentTarget);
        });
    }

    switchTab(tab) {
        document.querySelectorAll('.auth-tab').forEach((button) => {
            button.classList.toggle('active', button.dataset.authTab === tab);
        });
        document.querySelectorAll('.auth-form').forEach((form) => {
            form.classList.toggle('active', form.id === `${tab}Form`);
        });
    }

    togglePassword(button) {
        const input = document.getElementById(button.dataset.target);
        const icon = button.querySelector('i');
        if (!input || !icon) return;

        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        icon.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
        button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    }

    updatePasswordRules(password) {
        const rules = {
            length: /.{8,}/,
            uppercase: /[A-Z]/,
            lowercase: /[a-z]/,
            number: /[0-9]/,
        };

        Object.entries(rules).forEach(([name, regex]) => {
            const item = document.querySelector(`[data-rule="${name}"]`);
            const valid = regex.test(password);
            item?.classList.toggle('valid', valid);
            const icon = item?.querySelector('i');
            if (icon) {
                icon.className = valid ? 'fas fa-check' : 'fas fa-circle';
            }
        });
    }

    async login(form) {
        const formData = new FormData(form);
        const payload = {
            email: String(formData.get('email') || '').trim(),
            password: String(formData.get('password') || ''),
        };

        await this.submit(form, '/api/auth/login', payload, 'Signed in');
    }

    async register(form) {
        const formData = new FormData(form);
        const payload = {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            password: String(formData.get('password') || ''),
            confirm_password: String(formData.get('confirmPassword') || ''),
        };

        if (payload.password !== payload.confirm_password) {
            this.toast('Passwords do not match', 'error');
            return;
        }

        await this.submit(form, '/api/auth/register', payload, 'Account created');
    }

    async submit(form, url, payload, successMessage) {
        const button = form.querySelector('button[type="submit"]');
        this.setLoading(button, true);

        try {
            const result = await this.apiFetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            this.toast(successMessage, 'success');
            window.setTimeout(() => {
                window.location.href = this.appUrl();
            }, 600);
        } catch (error) {
            this.toast(error.message, 'error');
        } finally {
            this.setLoading(button, false);
        }
    }

    setLoading(button, loading) {
        if (!button) return;
        button.disabled = loading;
        button.classList.toggle('loading', loading);
    }

    async verifyExistingToken() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await this.apiFetch('/api/auth/me', { skipAuthRedirect: true });
            window.location.href = this.appUrl();
            return;
        } catch (error) {
            // Invalid local auth state is cleared below.
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    apiFetch(path, options = {}) {
        return window.PulseDeskAPI.apiFetch(path, options);
    }

    appUrl() {
        return window.location.protocol === 'file:' ? 'app.html' : '/app';
    }

    applyTheme(theme, persist = false) {
        document.documentElement.dataset.theme = theme;
        if (persist) {
            localStorage.setItem('theme', theme);
        }
        const icon = document.querySelector('#authThemeToggle i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toast(message, type = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}" aria-hidden="true"></i>
            <span>${this.escape(message)}</span>
            <button type="button" aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        `;
        toast.querySelector('button').addEventListener('click', () => toast.remove());
        stack.appendChild(toast);
        window.setTimeout(() => toast.classList.add('show'), 20);
        window.setTimeout(() => {
            toast.classList.remove('show');
            window.setTimeout(() => toast.remove(), 250);
        }, 4500);
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
}

document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});
