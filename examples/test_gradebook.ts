import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    const username = process.env.SKYWARD_USER;
    const password = process.env.SKYWARD_PASS;

    if (!username || !password) {
        console.error('Missing credentials');
        process.exit(1);
    }

    const scraper = new AlpineSkywardScraper();

    try {
        await scraper.init(true);
        const loggedIn = await scraper.login(username, password);
        if (!loggedIn) {
            console.error("Login failed");
            return;
        }

        const students = await scraper.getStudents();
        console.log("Students:", students);

        if (students.length > 0) {
            await scraper.selectStudent(students[0].name);
            const gradebook = await scraper.getGradebook();
            console.log("Gradebook output:");
            console.dir(gradebook, { depth: null });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await scraper.close();
    }
})();
