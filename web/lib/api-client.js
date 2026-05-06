(function () {
    function apiFetch(path, options = {}) {
        return window.PulseDeskAPI.apiFetch(path, options);
    }

    function apiUrl(path) {
        return window.PulseDeskAPI.apiUrl(path);
    }

    window.PulseDeskClient = {
        apiFetch,
        apiUrl,
    };
})();
