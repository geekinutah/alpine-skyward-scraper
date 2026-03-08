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
            console.log(`\n--- Fetching Gradebook for ${student.name} ---`);
            const selected = await scraper.selectStudent(student.name);
            if (!selected) {
                console.log(`Could not select ${student.name}`);
                continue;
            }

            const grades = await scraper.getGradebook();
            console.log(JSON.stringify(grades, null, 2));
        }

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await scraper.close();
    }
})();
