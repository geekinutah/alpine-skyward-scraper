import { test, expect, beforeAll } from 'vitest';
import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the .env file in the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = process.env.SKYWARD_URL;
const user = process.env.SKYWARD_USER;
const pass = process.env.SKYWARD_PASS;

beforeAll(() => {
    if (!url || !user || !pass) {
        throw new Error(
            'Live integration setup failed: SKYWARD_URL, SKYWARD_USER, and SKYWARD_PASS ' +
            'must be defined in the .env file to run the tests.'
        );
    }
});

// Since we are interacting with a live network environment sequentially, using a single setup 
// and sequentially checking the gradebook, schedule, and attendance decreases hitting 
// Skyward excessively.
test('AlpineSkywardScraper full integration loop', async () => {
    // Increase test timeout to account for real browser navigation and network loading.
    const TEST_TIMEOUT = 120000;

    // Instantiate and start scraper
    const scraper = new AlpineSkywardScraper();
    await scraper.init(true); // Headless mode so CI doesn't pop up

    try {
        // Test Login
        const loggedIn = await scraper.login(url!, user!, pass!);
        expect(loggedIn).toBe(true);

        // Ensure student list populates
        const students = await scraper.getStudents();
        expect(students.length).toBeGreaterThan(0);
        expect(students[0].name).toBeTruthy();

        // Select the first student found to test student switching correctly
        const selected = await scraper.selectStudent(students[0]);
        expect(selected).toBe(true);

        // Fetch Grades (tests explicit wait for gradebook)
        const grades = await scraper.getGradebook();
        expect(Array.isArray(grades)).toBe(true);

        // Fetch Schedule (tests explicit wait for schedule)
        // getSchedule() now returns ScheduleResult { schedule, activeTerm }
        const scheduleResult = await scraper.getSchedule();
        expect(Array.isArray(scheduleResult.schedule)).toBe(true);
        // activeTerm is a string or null — verify it's not undefined
        expect(scheduleResult.activeTerm === null || typeof scheduleResult.activeTerm === 'string').toBe(true);

        // Fetch Attendance (tests explicit wait for attendance)
        const attendance = await scraper.getAttendance();
        expect(Array.isArray(attendance)).toBe(true);

    } finally {
        // Ensure it always closes gracefully
        await scraper.close();
    }
}, 120000); // Specify timeout for the vitest explicitly since we are doing live browser actions
