import { Page } from 'playwright';
import type { ScheduleResult } from './types';
import { clickSidebarLink } from './browser';

export async function getSchedule(page: Page): Promise<ScheduleResult> {
    await clickSidebarLink(page, 'Schedule');

    const found = await page.waitForSelector('table[id^="grid_WEEKDAYStudentClasses_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
    if (!found) console.warn('[AlpineSkywardScraper] getSchedule: timed out waiting for schedule tables — data may be empty.');

    return page.evaluate((): ScheduleResult => {
        const results: { course: string; teacher: string; period: string; time?: string; term: string; room?: string }[] = [];

        const classTables = Array.from(
            document.querySelectorAll('table[id^="grid_WEEKDAYStudentClasses_"]')
        );

        const activeTermHeader = document.querySelector('th.sf_highlightYellow strong');
        const activeTerm = activeTermHeader ? activeTermHeader.textContent?.trim() ?? null : null;

        const periodTimes: Record<number, string> = {};
        document.querySelectorAll('table[id^="grid_WEEKDAY_scheduleGrid_"]').forEach(t => {
            t.querySelectorAll('tr').forEach((row) => {
                const text = (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
                const match = text.match(/Period (\d+)\(([^)]+)\)/);
                if (match) periodTimes[parseInt(match[1])] = match[2];
            });
        });

        for (const table of classTables) {
            const idParts = (table.id).split('_');
            const periodNum = parseInt(idParts[idParts.length - 2]);
            const termNum = parseInt(idParts[idParts.length - 1]);

            const firstRow = table.querySelector('tr');
            if (!firstRow) continue;

            const spans = Array.from(firstRow.querySelectorAll('span, a'));

            let course = '';
            let teacher = '';
            let room = '';

            if (spans.length > 0) {
                const courseSpan = firstRow.querySelector('.bld');
                course = courseSpan ? (courseSpan as HTMLElement).innerText.trim() : (spans[0] as HTMLElement).innerText.trim();
                if (spans.length > 1) teacher = (spans[1] as HTMLElement).innerText.trim();
                if (spans.length > 2) room = (spans[2] as HTMLElement).innerText.trim().replace(/^Room\s*/i, '');
            }

            if (!teacher || !room) {
                const parts = (firstRow as HTMLElement).innerText.split('\n').map(p => p.trim()).filter(Boolean);
                if (!course) course = parts[0] || '';
                if (!teacher) teacher = parts[1] || '';
                if (!room && parts[2]) room = parts[2].replace(/^Room\s*/i, '');
            }

            if (course && teacher && course.includes(teacher)) {
                course = course.split(teacher)[0].trim();
            }

            if (course && course.length > 1) {
                results.push({
                    course,
                    teacher,
                    period: `Period ${periodNum}`,
                    time: periodTimes[periodNum],
                    term: `Term ${termNum}`,
                    room: room || undefined,
                });
            }
        }

        const seen = new Set<string>();
        const schedule = results.filter(r => {
            const key = `${r.course}|${r.period}|${r.term}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return { schedule, activeTerm };
    });
}
