import { test, expect } from 'vitest';
import { getAttendance } from '../src/attendance';
import { createLoggedInPage, selectFirstStudent } from './liveTestUtils';

test('getAttendance loads attendance entries', async () => {
    const { page, scraper } = await createLoggedInPage();

    try {
        await selectFirstStudent(page);

        const attendance = await getAttendance(page);
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
