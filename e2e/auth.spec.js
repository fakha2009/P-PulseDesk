const { expect, test } = require('@playwright/test');
const { login, register, uniqueUser } = require('./helpers');

test('registration login logout and protected redirect', async ({ page }) => {
    const user = uniqueUser('auth');

    await register(page, user);
    await expect(page.locator('#profileEmail')).toBeAttached();

    await page.locator('#profileLogout, #sidebarLogout').first().click();
    await expect(page).toHaveURL(/\/auth/);

    await login(page, user);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app|\/dashboard/);

    await page.evaluate(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    });
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth/);
});

test('wrong credentials show an error', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('#loginEmail').fill('missing-user@example.test');
    await page.locator('#loginPassword').fill('WrongPassword123');
    await page.locator('#loginFormElement button[type="submit"]').click();
    await expect(page.locator('#toastStack')).toContainText(/invalid|wrong|not found|не/i);
});
