import { Page } from 'playwright';
import type { AttendanceEntry } from './types';
import { clickSidebarLink } from './browser';

export async function getAttendance(page: Page): Promise<AttendanceEntry[]> {
    await clickSidebarLink(page, 'Attendance');

    const found = await page.waitForSelector('table[id^="grid_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
    if (!found) console.warn('[AlpineSkywardScraper] getAttendance: timed out waiting for attendance table — data may be empty.');

    return page.evaluate(() => {
        const results: { date: string; type: string; period: string; course: string }[] = [];

        const tables = Array.from(document.querySelectorAll('table[id^="grid_"]'));
        for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            let headers: string[] = [];

            for (const row of rows) {
                const ths = Array.from(row.querySelectorAll('th'));
                if (ths.length > 0) {
                    headers = ths.map(th => (th as HTMLElement).innerText.trim().toLowerCase());
                    continue;
                }
                if (headers.length === 0) continue;

                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 2) continue;
                const values = cells.map(c => (c as HTMLElement).innerText.trim());

                const entry: { date: string; type: string; period: string; course: string } = {
                    date: '', type: '', period: '', course: ''
                };

                headers.forEach((h, i) => {
                    const val = values[i] || '';
                    if (h.includes('date')) entry.date = val;
                    else if (h.includes('type') || h.includes('status') || h.includes('reason')) entry.type = val;
                    else if (h.includes('period')) entry.period = val;
                    else if (h.includes('class') || h.includes('course') || h.includes('description')) entry.course = val;
                });

                if (entry.date || entry.type) results.push(entry);
            }
        }

        return results;
    });
}
