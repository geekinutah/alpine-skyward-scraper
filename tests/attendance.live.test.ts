import { test, expect } from 'vitest';
import { createLoggedInScraper, selectFirstStudent } from './liveTestUtils';

test('getAttendance loads attendance entries', async () => {
    const scraper = await createLoggedInScraper();

    try {
        await selectFirstStudent(scraper);

        const attendance = await scraper.getAttendance();
        expect(Array.isArray(attendance)).toBe(true);

        if (attendance.length > 0) {
            const first = attendance[0];
            expect(typeof first.date).toBe('string');
            expect(typeof first.type).toBe('string');
            expect(typeof first.period).toBe('string');
            expect(typeof first.course).toBe('string');
        }
    } finally {
        await scraper.close();
    }
}, 120000);
