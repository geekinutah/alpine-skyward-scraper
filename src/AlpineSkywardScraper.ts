import { Page } from 'playwright';
import type { Student, GradeEntry, ScheduleResult, AttendanceEntry } from './types';
import { BrowserState, initBrowser, closeBrowser, requirePage } from './browser';
import { getStudents, selectStudent } from './students';
import { getGradebook } from './gradebook';
import { getSchedule } from './schedule';
import { getAttendance } from './attendance';

/**
 * A Playwright-based scraper for the Alpine School District's Skyward Family Access portal.
 *
 * Maintains a persistent browser session. Create one instance, call `init()` and `login()`,
 * then call data methods as needed. Call `close()` when done.
 *
 * @example
 * ```typescript
 * const scraper = new AlpineSkywardScraper();
 * await scraper.init();
 * await scraper.login(url, username, password);
 * await scraper.selectStudent('Jane Doe');
 * const grades = await scraper.getGradebook();
 * await scraper.close();
 * ```
 */
export class AlpineSkywardScraper {
    private state: BrowserState = { browser: null, context: null, page: null };

    /**
     * Default URL for the Alpine School District Skyward Family Access portal.
     */
    public static readonly ALPINE_URL = 'https://skyward.alpinedistrict.org/scripts/wsisa.dll/WService=wsEAplus/seplog01';

    /**
     * Provides access to the underlying Playwright `Page` instance.
     * Useful for advanced use cases like navigating to custom pages or dumping HTML.
     * Will be `null` until `init()` is called.
     */
    get page(): Page | null {
        return this.state.page;
    }

    /**
     * Launches the Chromium browser. Must be called before `login()`.
     * @param headless - Run without a visible UI. Defaults to `true`.
     *                   Pass `false` for debugging to watch the browser operate.
     */
    async init(headless: boolean = true): Promise<void> {
        this.state = await initBrowser(headless);
    }

    /**
     * Navigates to the Skyward login page and authenticates.
     * Handles the popup window that Skyward opens after login.
     *
     * @param username - Skyward username
     * @param password - Skyward password
     * @param url - Full URL to the Skyward login page. Defaults to `AlpineSkywardScraper.ALPINE_URL`.
     * @returns `true` on success
     * @throws Error if `init()` has not been called, or if login fails
     */
    async login(username: string, password: string, url: string = AlpineSkywardScraper.ALPINE_URL): Promise<boolean> {
        if (!this.state.page) {
            throw new Error('Call init() before logging in.');
        }

        await this.state.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await this.state.page.waitForSelector('#login', { timeout: 10000 });
        await this.state.page.fill('#login', username);
        await this.state.page.fill('#password', password);

        // Skyward may open a new popup window or navigate in the same tab
        const newPagePromise = this.state.context!.waitForEvent('page', { timeout: 5000 }).catch(() => null);
        await this.state.page.click('#bLogin');
        const newPage = await newPagePromise;

        if (newPage) {
            this.state.page = newPage;
        }
        await this.state.page.waitForLoadState('networkidle');

        return true;
    }

    /**
     * Returns all students associated with the logged-in account.
     *
     * @returns Array of students with their name and internal Skyward ID
     * @throws Error if not logged in
     */
    async getStudents(): Promise<Student[]> {
        return getStudents(requirePage(this.state));
    }

    /**
     * Switches the active student context. Must be called before data methods to
     * ensure grades/schedule/attendance belong to the correct student.
     *
     * Accepts either a **name string** or a **`Student` object** (as returned by `getStudents()`).
     * Passing a `Student` object is preferred — it matches by Skyward's internal ID,
     * which is faster and more reliable than fuzzy name matching.
     *
     * @param student - Full name string (e.g. `"Jane Doe"`) or a `Student` object with an `id`
     * @returns `true` if the student was found and selected
     * @throws Error if not logged in or student is not found
     *
     * @example
     * ```typescript
     * // By name
     * await scraper.selectStudent('Jane Doe');
     *
     * // By Student object (recommended)
     * const students = await scraper.getStudents();
     * await scraper.selectStudent(students[0]);
     * ```
     */
    async selectStudent(student: string | Student): Promise<boolean> {
        return selectStudent(requirePage(this.state), student);
    }

    /**
     * Fetches the gradebook for the currently selected student.
     *
     * Works with both High School (quarter-based, split-table layout) and
     * Elementary (standards-based, single-table layout) Skyward portals.
     *
     * @returns Array of courses, each with a list of per-period letter grades
     * @throws Error if not logged in or navigation fails
     */
    async getGradebook(term?: string): Promise<GradeEntry[]> {
        return getGradebook(requirePage(this.state), term);
    }

    /**
     * Fetches the class schedule for the currently selected student.
     *
     * Parses each term's schedule from the Skyward weekly schedule grid.
     * Each entry contains the course name, teacher, period, time, term, and room.
     *
     * @returns Array of `ScheduleEntry` objects (may contain duplicates across terms)
     * @throws Error if not logged in or navigation fails
     */
    async getSchedule(): Promise<ScheduleResult> {
        return getSchedule(requirePage(this.state));
    }

    /**
     * @deprecated Use `(await getSchedule()).activeTerm` instead.
     * Keeping for backwards compatibility only — this method navigates to the
     * Schedule page twice if called alongside `getSchedule()`.
     */
    async getActiveTerm(): Promise<string | null> {
        const result = await this.getSchedule();
        return result.activeTerm;
    }

    /**
     * Fetches the attendance history for the currently selected student.
     *
     * Maps header columns to values dynamically, so it's resilient to Skyward
     * reordering columns between school years.
     *
     * @returns Array of `AttendanceEntry` objects, empty if no absences recorded
     * @throws Error if not logged in or navigation fails
     */
    async getAttendance(): Promise<AttendanceEntry[]> {
        return getAttendance(requirePage(this.state));
    }

    /**
     * Closes the browser and releases all resources.
     * Always call this when you are finished using the scraper.
     */
    async close(): Promise<void> {
        await closeBrowser(this.state);
    }
}
