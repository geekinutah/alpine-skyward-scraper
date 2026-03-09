import { beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';

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

export async function createLoggedInScraper(): Promise<AlpineSkywardScraper> {
    const scraper = new AlpineSkywardScraper();
    await scraper.init(true);
    await scraper.login(user!, pass!);
    return scraper;
}

export async function selectFirstStudent(scraper: AlpineSkywardScraper) {
    const students = await scraper.getStudents();
    if (students.length === 0) {
        throw new Error('No students were returned by Skyward.');
    }

    await scraper.selectStudent(students[0]);
    return students[0];
}

export async function findStudentWithGradeDetails(scraper: AlpineSkywardScraper) {
    const students = await scraper.getStudents();
    if (students.length === 0) {
        throw new Error('No students were returned by Skyward.');
    }

    for (const student of students) {
        await scraper.selectStudent(student);
        const grades = await scraper.getGradebook();
        const gradeWithEntries = grades.find((entry) => Array.isArray(entry.assignmentEntries) && entry.assignmentEntries.length > 0);

        if (gradeWithEntries) {
            return { student, grades, gradeWithEntries };
        }
    }

    throw new Error('No student on this account returned grade detail entries for the current term.');
}
