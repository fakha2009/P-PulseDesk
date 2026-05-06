const { expect, test } = require('@playwright/test');
const { api, createHabit, register, uniqueUser } = require('./helpers');

test('habits proof submission deletion filters and pagination', async ({ page }) => {
    const user = uniqueUser('proof');
    await register(page, user);

    const simple = await createHabit(page, { title: `Simple ${Date.now()}` });
    await api(page, `/api/habits/${simple.id}/check`, { method: 'PATCH' });

    const noteHabit = await createHabit(page, {
        title: `Note ${Date.now()}`,
        proof_type: 'note',
        proof_prompt: 'Write a short note',
    });
    await expect(api(page, `/api/habits/${noteHabit.id}/check`, { method: 'PATCH' })).rejects.toThrow();

    const noteProof = await submitProof(page, noteHabit.id, {
        type: 'note',
        note: 'Finished the reading session',
    });
    expect(noteProof.type).toBe('note');

    const photoHabit = await createHabit(page, {
        title: `Photo ${Date.now()}`,
        proof_type: 'photo',
    });
    await submitProof(page, photoHabit.id, {
        type: 'photo',
        fileName: 'proof.png',
        mimeType: 'image/png',
        content: pngBase64(),
    });

    const audioHabit = await createHabit(page, {
        title: `Audio ${Date.now()}`,
        proof_type: 'audio',
    });
    const audioProof = await submitProof(page, audioHabit.id, {
        type: 'audio',
        fileName: 'proof.webm',
        mimeType: 'audio/webm',
        content: webmBase64(),
    });

    const all = await api(page, '/api/proofs?page=1&limit=2');
    expect(all.items.length).toBeLessThanOrEqual(2);
    expect(all.total).toBeGreaterThanOrEqual(3);
    expect(all.has_more).toBeTruthy();

    const photos = await api(page, '/api/proofs?page=1&limit=24&type=photo');
    expect(photos.items.every((item) => item.type === 'photo')).toBeTruthy();

    const notes = await api(page, '/api/proofs?page=1&limit=24&type=note');
    expect(notes.items.some((item) => item.id === noteProof.id)).toBeTruthy();

    const emptyRange = await api(page, '/api/proofs?page=1&limit=24&date_from=1999-01-01&date_to=1999-01-02');
    expect(emptyRange.items).toHaveLength(0);

    await api(page, `/api/proofs/${audioProof.id}`, { method: 'DELETE' });
    const afterDelete = await api(page, '/api/proofs?page=1&limit=24&type=audio');
    expect(afterDelete.items.some((item) => item.id === audioProof.id)).toBeFalsy();

    await page.goto('/library');
    await expect(page.locator('#proofLibraryList')).toBeVisible();
    await page.getByRole('button', { name: /Фото|Photo/i }).click();
    await expect(page.locator('#proofLibraryList')).toContainText(photoHabit.title);
});

async function submitProof(page, habitID, proof) {
    return page.evaluate(async ({ habitID, proof }) => {
        const formData = new FormData();
        formData.set('type', proof.type);
        formData.set('completion_date', new Date().toISOString().slice(0, 10));
        if (proof.note) {
            formData.set('note', proof.note);
        }
        if (proof.content) {
            const bytes = Uint8Array.from(atob(proof.content), (char) => char.charCodeAt(0));
            const file = new File([bytes], proof.fileName, { type: proof.mimeType });
            formData.set('file', file);
        }
        return window.PulseDeskAPI.apiFetch(`/api/habits/${habitID}/proofs`, {
            method: 'POST',
            body: formData,
        });
    }, { habitID, proof });
}

function pngBase64() {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
}

function webmBase64() {
    return 'GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKjgQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZqVzc6LyAABCrgEAAAAAAAAfQ7Z1bmSIgQCGhVZfVlAALN8W0YEIyTWH7WQAA';
}
