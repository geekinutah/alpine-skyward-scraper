import { test, expect } from 'vitest';
import { createLoggedInScraper, selectFirstStudent } from './liveTestUtils';

test('getSchedule loads schedule entries and active term', async () => {
    const scraper = await createLoggedInScraper();

    try {
        await selectFirstStudent(scraper);

        const scheduleResult = await scraper.getSchedule();
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
