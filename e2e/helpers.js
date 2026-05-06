const { expect, test } = require('@playwright/test');

const enabled = process.env.PULSEDESK_E2E === '1';
test.skip(!enabled, 'Set PULSEDESK_E2E=1 and E2E_BASE_URL with an isolated test database to run e2e tests.');

function uniqueUser(prefix = 'e2e') {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
        name: `PulseDesk ${prefix}`,
        email: `${prefix}-${suffix}@example.test`,
        password: 'E2ePassword123',
    };
}

async function register(page, user) {
    await page.goto('/auth');
    await page.getByRole('button', { name: /Регистрация|Registration/i }).click();
    await page.locator('#registerName').fill(user.name);
    await page.locator('#registerEmail').fill(user.email);
    await page.locator('#registerPassword').fill(user.password);
    await page.locator('#confirmPassword').fill(user.password);
    await page.locator('#registerFormElement button[type="submit"]').click();
    await expect(page).toHaveURL(/\/app|\/dashboard|\/tasks|\/habits|\/library/);
}

async function login(page, user) {
    await page.goto('/auth');
    await page.locator('#loginEmail').fill(user.email);
    await page.locator('#loginPassword').fill(user.password);
    await page.locator('#loginFormElement button[type="submit"]').click();
    await expect(page).toHaveURL(/\/app|\/dashboard|\/tasks|\/habits|\/library/);
}

async function api(page, path, options = {}) {
    return page.evaluate(async ({ path, options }) => {
        const response = await window.PulseDeskAPI.apiFetch(path, options);
        return response;
    }, { path, options });
}

async function createHabit(page, payload) {
    return api(page, '/api/habits', {
        method: 'POST',
        body: JSON.stringify({
            title: payload.title,
            description: payload.description || '',
            color: payload.color || '#4f46e5',
            proof_type: payload.proof_type || 'none',
            proof_prompt: payload.proof_prompt || '',
        }),
    });
}

module.exports = {
    api,
    createHabit,
    login,
    register,
    uniqueUser,
};
