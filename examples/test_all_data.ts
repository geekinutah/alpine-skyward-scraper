import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    const url = process.env.SKYWARD_URL || '';
    const username = process.env.SKYWARD_USER || '';
    const password = process.env.SKYWARD_PASS || '';

    const scraper = new AlpineSkywardScraper();

    try {
        await scraper.init();
        console.log(`Logging in to ${url}...`);
        await scraper.login(url, username, password);
        console.log("Login successful!");

        const students = await scraper.getStudents();
        console.log("Students:", students);

        for (const student of students) {
            console.log(`\n--- Fetching Data for ${student.name} ---`);
            await scraper.selectStudent(student.name);

            console.log("Fetching Gradebook...");
            const grades = await scraper.getGradebook();
            console.log(`  Found ${grades.length} courses with grades.`);

            console.log("Fetching Schedule...");
            const schedule = await scraper.getSchedule();
            console.log(`  Found ${schedule.length} schedule entries.`);
            if (schedule.length > 0) {
                console.log("  First entry:", schedule[0]);
            }

            console.log("Fetching Attendance...");
            const attendance = await scraper.getAttendance();
            console.log(`  Found ${attendance.length} attendance records.`);
        }

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await scraper.close();
    }
})();
