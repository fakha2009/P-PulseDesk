(function () {
    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[char]);
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function emptyState(icon, title, text) {
        return `
            <div class="empty-state">
                <i class="fas ${icon}" aria-hidden="true"></i>
                <h3>${title}</h3>
                <p>${text}</p>
            </div>
        `;
    }

    function toast(message, type = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;

        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
        const toastNode = document.createElement('div');
        toastNode.className = `toast toast-${type}`;
        toastNode.innerHTML = `
            <i class="fas ${icon}" aria-hidden="true"></i>
            <span>${escapeHTML(message)}</span>
            <button type="button" aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        `;
        toastNode.querySelector('button').addEventListener('click', () => toastNode.remove());
        stack.appendChild(toastNode);
        window.setTimeout(() => toastNode.classList.add('show'), 20);
        window.setTimeout(() => {
            toastNode.classList.remove('show');
            window.setTimeout(() => toastNode.remove(), 250);
        }, 4500);
    }

    window.PulseDeskUI = {
        emptyState,
        escapeHTML,
        setText,
        toast,
    };
})();
