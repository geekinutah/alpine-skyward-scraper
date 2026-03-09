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
        await scraper.login(username, password);

        const students = await scraper.getStudents();
        console.log('Students:', students);

        if (students.length === 0) {
            console.log('No students found.');
            return;
        }

        await scraper.selectStudent(students[0]);
        const gradebook = await scraper.getGradebook();

        for (const entry of gradebook) {
            const assignmentCount = entry.assignmentEntries?.length || 0;
            console.log(`\n${entry.course}`);
            console.log(`Grades: ${entry.grades.map((grade) => `${grade.period}=${grade.grade}`).join(', ')}`);
            console.log(`Assignment entries: ${assignmentCount}`);

            if (assignmentCount > 0) {
                console.dir(entry.assignmentEntries![0], { depth: null });
            }
        }
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        await scraper.close();
    }
})();
