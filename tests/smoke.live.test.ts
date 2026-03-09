import { test, expect } from 'vitest';
import { createLoggedInScraper, selectFirstStudent } from './liveTestUtils';

test('live smoke flow works end-to-end in one browser session', async () => {
    const scraper = await createLoggedInScraper();

    try {
        const student = await selectFirstStudent(scraper);
        expect(student.name).toBeTruthy();

        const grades = await scraper.getGradebook();
        expect(Array.isArray(grades)).toBe(true);

        const scheduleResult = await scraper.getSchedule();
        expect(Array.isArray(scheduleResult.schedule)).toBe(true);

        const attendance = await scraper.getAttendance();
        expect(Array.isArray(attendance)).toBe(true);
    } finally {
        await scraper.close();
    }
}, 420000);
