import { test, expect } from 'vitest';
import { getSchedule } from '../src/schedule';
import { createLoggedInPage, selectFirstStudent } from './liveTestUtils';

test('getSchedule loads schedule entries and active term', async () => {
    const { page, scraper } = await createLoggedInPage();

    try {
        await selectFirstStudent(page);

        const scheduleResult = await getSchedule(page);
        expect(Array.isArray(scheduleResult.schedule)).toBe(true);
        expect(scheduleResult.activeTerm === null || typeof scheduleResult.activeTerm === 'string').toBe(true);

        if (scheduleResult.schedule.length > 0) {
            const first = scheduleResult.schedule[0];
            expect(first.course).toBeTruthy();
            expect(first.teacher).toBeTruthy();
            expect(first.period).toBeTruthy();
            expect(first.term).toBeTruthy();
        }
    } finally {
        await scraper.close();
    }
}, 120000);
