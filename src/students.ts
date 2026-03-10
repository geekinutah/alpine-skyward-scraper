import { Page } from 'playwright';
import type { Student } from './types';

export async function getStudents(page: Page): Promise<Student[]> {
    await page.waitForSelector('#sf_StudentList', { state: 'attached', timeout: 10000 });

    return page.evaluate(() => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#sf_StudentList a[role="option"]'));
        return links
            .map(el => ({
                name: el.innerText.trim(),
                id: el.dataset.nameid || null,
            }))
            .filter(s => s.name && s.name !== 'All Students');
    });
}

export async function selectStudent(page: Page, student: string | Student): Promise<boolean> {
    const selectBtn = page.locator('#sf_StudentSelect');
    if (await selectBtn.count()) {
        await selectBtn.click({ force: true });
        await page.locator('#sf_StudentList').waitFor({ state: 'visible', timeout: 2000 }).catch(() => null);
    }

    const options = page.locator('#sf_StudentList a[role="option"]');
    for (const option of await options.all()) {
        const text = (await option.innerText()).trim();
        const dataId = await option.getAttribute('data-nameid');

        const isMatch = typeof student === 'string'
            ? text === student || text.includes(student)
            : (student.id !== null && dataId === student.id) || text === student.name;

        if (isMatch) {
            await option.click({ force: true });
            await page.waitForLoadState('networkidle');
            await page.waitForSelector('#sf_StudentSelect', { state: 'visible', timeout: 500 });
            return true;
        }
    }

    const label = typeof student === 'string' ? student : student.name;
    throw new Error(`Student "${label}" not found in the dropdown. Call getStudents() to see available names.`);
}
