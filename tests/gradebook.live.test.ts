import { test, expect } from 'vitest';
import { getGradebook } from '../src/gradebook';
import { createLoggedInPage, findStudentWithGradeDetails } from './liveTestUtils';

test('getGradebook loads grade entries with assignment details', async () => {
    const { page, scraper } = await createLoggedInPage();

    try {
        const { grades, gradeWithEntries } = await findStudentWithGradeDetails(page);
        expect(Array.isArray(grades)).toBe(true);
        expect(grades.length).toBeGreaterThan(0);
        expect(Array.isArray(gradeWithEntries.assignmentEntries)).toBe(true);

        const sampleAssignment = gradeWithEntries.assignmentEntries![0];
        expect(sampleAssignment.name).toBeTruthy();
        expect(sampleAssignment.isSkill === true || sampleAssignment.isSkill === false || sampleAssignment.isSkill === undefined).toBe(true);

        if (sampleAssignment.isSkill) {
            expect(sampleAssignment.subject || sampleAssignment.skillDescription || sampleAssignment.grade).toBeTruthy();
        } else {
            expect(sampleAssignment.category || sampleAssignment.dueDate || sampleAssignment.pointsText || sampleAssignment.grade).toBeTruthy();
        }
    } finally {
        await scraper.close();
    }
}, 360000);
