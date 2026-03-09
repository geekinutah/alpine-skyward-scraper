import { test, expect } from 'vitest';
import { createLoggedInScraper, findStudentWithGradeDetails } from './liveTestUtils';

test('getGradebook loads grade entries with assignment details', async () => {
    const scraper = await createLoggedInScraper();

    try {
        const { grades, gradeWithEntries } = await findStudentWithGradeDetails(scraper);
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
