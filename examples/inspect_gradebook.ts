import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

(async () => {
    const url = process.env.SKYWARD_URL || '';
    const username = process.env.SKYWARD_USER || '';
    const password = process.env.SKYWARD_PASS || '';

    const scraper = new AlpineSkywardScraper();

    try {
        await scraper.init(true);
        const loggedIn = await scraper.login(url, username, password);
        if (!loggedIn) {
            console.error("Login failed");
            return;
        }

        const students = await scraper.getStudents();
        console.log("Students:", students);

        if (students.length > 0) {
            await scraper.selectStudent(students[0].name);

            // Navigate to Gradebook
            const linkHandle = await (scraper as any).page.evaluateHandle(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.find(l => l.innerText.trim() === 'Gradebook' && l.offsetWidth > 0);
            });
            const link = linkHandle.asElement();
            if (link) {
                await link.click({ force: true });
                await (scraper as any).page.waitForLoadState('networkidle');
                await (scraper as any).page.waitForTimeout(4000);

                const html = await (scraper as any).page.content();
                fs.writeFileSync('gradebook_dump.html', html);
                console.log('Dumped Gradebook HTML to gradebook_dump.html');
            } else {
                console.log('Failed to jump to Gradebook');
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await scraper.close();
    }
})();
