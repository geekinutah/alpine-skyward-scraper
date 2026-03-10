import { test, expect } from 'vitest';
import { getStudents, selectStudent } from '../src/students';
import { getGradebook } from '../src/gradebook';
import { getSchedule } from '../src/schedule';
import { getAttendance } from '../src/attendance';
import { createLoggedInPage } from './liveTestUtils';

test('live smoke flow works end-to-end in one browser session', async () => {
    const { page, scraper } = await createLoggedInPage();

    try {
        const students = await getStudents(page);
        expect(students.length).toBeGreaterThan(0);

        await selectStudent(page, students[0]);
        expect(students[0].name).toBeTruthy();

        const grades = await getGradebook(page);
        expect(Array.isArray(grades)).toBe(true);

        const scheduleResult = await getSchedule(page);
        expect(Array.isArray(scheduleResult.schedule)).toBe(true);

        const attendance = await getAttendance(page);
        expect(Array.isArray(attendance)).toBe(true);
    } finally {
        await scraper.close();
    }
}, 420000);
