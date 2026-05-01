(function () {
    function trimSlash(value) {
        return String(value || '').replace(/\/$/, '');
    }

    function metaApiBaseUrl() {
        return document.querySelector('meta[name="api-base-url"]')?.getAttribute('content') || '';
    }

    function resolveApiBaseUrl() {
        return trimSlash(
            window.__API_BASE_URL__ ||
            window.PULSEDESK_CONFIG?.API_BASE_URL ||
            metaApiBaseUrl() ||
            window.PULSEDESK_API_BASE_URL ||
            window.API_BASE_URL ||
            (window.location.protocol === 'file:' ? 'http://localhost:8082' : '')
        );
    }

    function apiUrl(path) {
        return `${resolveApiBaseUrl()}${path}`;
    }

    async function apiFetch(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = localStorage.getItem('token');

        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        if (options.body && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(apiUrl(path), { ...options, headers });
        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (!options.skipAuthRedirect && !window.location.pathname.includes('/auth')) {
                window.location.href = window.location.protocol === 'file:' ? 'index.html' : '/auth';
            }
        }

        if (!response.ok || payload.success === false) {
            throw new Error(payload.error || `Request failed with status ${response.status}`);
        }

        return payload.data;
    }

    window.PulseDeskAPI = {
        resolveApiBaseUrl,
        apiUrl,
        apiFetch,
    };
})();
