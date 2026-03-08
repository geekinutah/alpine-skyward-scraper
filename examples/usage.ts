import { AlpineSkywardScraper } from '../src/AlpineSkywardScraper';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the .env file in the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const user = process.env.SKYWARD_USER;
const pass = process.env.SKYWARD_PASS;

async function main() {
    if (!user || !pass) {
        console.error('Missing SKYWARD_USER or SKYWARD_PASS in .env file');
        process.exit(1);
    }

    const scraper = new AlpineSkywardScraper();

    try {
        console.log('Initializing scraper...');
        // Use headless: false for debugging/development
        await scraper.init(false);

        console.log('Logging in...');
        const loggedIn = await scraper.login(user, pass);

        if (loggedIn) {
            console.log('Successfully logged in! Ready for data discovery.');
        } else {
            console.error('Login failed.');
        }
    } catch (error) {
        console.error('Error during execution:', error);
    } finally {
        console.log('Closing browser...');
        await scraper.close();
    }
}

main();
