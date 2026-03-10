import { beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Page } from 'playwright';
import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import { getStudents, selectStudent } from '../src/students';
import { getGradebook } from '../src/gradebook';
import type { Student } from '../src/types';

dotenv.config({ path: path.join(__dirname, '../.env') });

export const user = process.env.SKYWARD_USER;
export const pass = process.env.SKYWARD_PASS;

beforeAll(() => {
    if (!user || !pass) {
        throw new Error(
            'Live integration setup failed: SKYWARD_USER and SKYWARD_PASS ' +
            'must be defined in the .env file to run the tests.'
        );
    }
});

/**
 * Creates a logged-in scraper instance. Use when testing the class API directly.
 */
export async function createLoggedInScraper(): Promise<AlpineSkywardScraper> {
    const scraper = new AlpineSkywardScraper();
    await scraper.init(true);
    await scraper.login(user!, pass!);
    return scraper;
}

/**
 * Creates a logged-in browser session and returns the Page.
 * Use when testing module functions directly.
 * The caller is responsible for calling scraper.close() when done.
 */
export async function createLoggedInPage(): Promise<{ page: Page; scraper: AlpineSkywardScraper }> {
    const scraper = await createLoggedInScraper();
    return { page: scraper.page!, scraper };
}

export async function selectFirstStudent(page: Page): Promise<Student> {
    const students = await getStudents(page);
    if (students.length === 0) {
        throw new Error('No students were returned by Skyward.');
    }
    await selectStudent(page, students[0]);
    return students[0];
}

export async function findStudentWithGradeDetails(page: Page) {
    const students = await getStudents(page);
    if (students.length === 0) {
        throw new Error('No students were returned by Skyward.');
    }

    for (const student of students) {
        await selectStudent(page, student);
        const grades = await getGradebook(page);
        const gradeWithEntries = grades.find((entry) => Array.isArray(entry.assignmentEntries) && entry.assignmentEntries.length > 0);

        if (gradeWithEntries) {
            return { student, grades, gradeWithEntries };
        }
    }

    throw new Error('No student on this account returned grade detail entries for the current term.');
}
