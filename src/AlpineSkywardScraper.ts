import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { Student, GradeEntry, ScheduleEntry, ScheduleResult, AttendanceEntry } from './types';


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
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private _page: Page | null = null;

    /**
     * Provides access to the underlying Playwright `Page` instance.
     * Useful for advanced use cases like navigating to custom pages or dumping HTML.
     * Will be `null` until `init()` is called.
     */
    get page(): Page | null {
        return this._page;
    }

    /**
     * Launches the Chromium browser. Must be called before `login()`.
     * @param headless - Run without a visible UI. Defaults to `true`.
     *                   Pass `false` for debugging to watch the browser operate.
     */
    async init(headless: boolean = true): Promise<void> {
        this.browser = await chromium.launch({ headless });
        this.context = await this.browser.newContext();
        this._page = await this.context.newPage();
    }

    /**
     * Navigates to the Skyward login page and authenticates.
     * Handles the popup window that Skyward opens after login.
     *
     * @param url - Full URL to the Skyward login page (e.g. your district's seplog01 URL)
     * @param username - Skyward username
     * @param password - Skyward password
     * @returns `true` on success
     * @throws Error if `init()` has not been called, or if login fails
     */
    async login(url: string, username: string, password: string): Promise<boolean> {
        if (!this._page) {
            throw new Error('Call init() before logging in.');
        }

        await this._page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await this._page.waitForSelector('#login', { timeout: 10000 });
        await this._page.fill('#login', username);
        await this._page.fill('#password', password);

        // Skyward opens a new window after login — listen for it
        const [newPage] = await Promise.all([
            this.context!.waitForEvent('page', { timeout: 20000 }).catch(() => null),
            this._page.click('#bLogin'),
        ]);

        if (newPage) {
            this._page = newPage;
            await this._page.waitForLoadState('networkidle');
        } else {
            await this._page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
        }

        if (this._page.url().includes('seplog01')) {
            throw new Error('Login failed: still on login page. Check credentials.');
        }

        return true;
    }

    /**
     * Returns all students associated with the logged-in account.
     *
     * @returns Array of students with their name and internal Skyward ID
     * @throws Error if not logged in
     */
    async getStudents(): Promise<Student[]> {
        if (!this._page) throw new Error('Call login() first.');

        await this._page.waitForSelector('#sf_StudentList', { timeout: 10000 }).catch(() => null);

        return this._page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('#sf_StudentList a[role="option"]'));
            return links
                .map(el => ({
                    name: (el as HTMLElement).innerText.trim(),
                    id: (el as HTMLElement).dataset.nameid || null,
                }))
                .filter(s => s.name && s.name !== 'All Students');
        });
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
        if (!this._page) throw new Error('Call login() first.');

        const selectBtn = await this._page.$('#sf_StudentSelect');
        if (selectBtn) {
            await selectBtn.click({ force: true });
            await this._page.waitForTimeout(500);
        }

        const options = await this._page.$$('#sf_StudentList a[role="option"]');
        for (const option of options) {
            const text = (await option.innerText()).trim();
            const dataId = await option.getAttribute('data-nameid');

            const isMatch = typeof student === 'string'
                ? text === student || text.includes(student)
                : (student.id !== null && dataId === student.id) || text === student.name;

            if (isMatch) {
                await option.click({ force: true });
                // Wait for the page to fully reflect the new student context
                await this._page.waitForLoadState('networkidle');
                // Allow time for Skyward's JS to update the student context
                await this._page.waitForSelector('#sf_StudentSelect', { state: 'visible', timeout: 5000 }).catch(() => null);
                return true;
            }
        }

        const label = typeof student === 'string' ? student : student.name;
        throw new Error(`Student "${label}" not found in the dropdown. Call getStudents() to see available names.`);
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
    async getGradebook(): Promise<GradeEntry[]> {
        if (!this._page) throw new Error('Call login() first.');

        const link = await this._page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('a')).find(el => el.textContent?.trim() === 'Gradebook');
        });
        const el = link.asElement();
        if (!el) throw new Error('Gradebook link not found in sidebar.');
        await el.click();

        // Wait for gradebook rows to appear, instead of an arbitrary timeout
        const found = await this._page.waitForSelector('tr[data-rownum], tr[data-desc], .classDesc', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getGradebook: timed out waiting for gradebook rows — data may be empty.');

        return this._page.evaluate(() => {
            const courses = new Map<string, GradeEntry>();

            interface GradeEntry {
                course: string;
                grades: { period: string; grade: string }[];
            }

            const rows = Array.from(document.querySelectorAll('tr[data-rownum], tr[data-desc]'));
            for (const row of rows) {
                const rownum = (row as HTMLElement).dataset.rownum
                    || (row as HTMLElement).dataset.desc
                    || String(Math.random());

                if (!courses.has(rownum)) {
                    courses.set(rownum, { course: '', grades: [] });
                }
                const data = courses.get(rownum)!;

                // Course name: elementary (data-desc) or high school (.classDesc span)
                const courseName = (row as HTMLElement).dataset.desc
                    || row.querySelector('.classDesc')?.textContent?.trim()
                    || '';
                if (courseName && !data.course) data.course = courseName;

                // High school: grade links with data-lit (Q1/Q2/Q3...)
                const gradeLinks = Array.from(row.querySelectorAll('a[id^="showGradeInfo"]'));
                for (const a of gradeLinks) {
                    const grade = a.textContent?.trim() || '';
                    const period = (a as HTMLElement).dataset.lit || '';
                    if (grade && period) data.grades.push({ period, grade });
                }

                // Elementary: current grade in bolded/current cell
                if (gradeLinks.length === 0) {
                    for (const cell of Array.from(row.querySelectorAll('.fB, .fWn.fIl'))) {
                        const a = cell.querySelector('a');
                        const grade = a?.textContent?.trim() || '';
                        if (grade && grade.length < 5) data.grades.push({ period: 'Current', grade });
                    }
                }
            }

            return Array.from(courses.values()).filter(c => c.course !== '');
        });
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
        if (!this._page) throw new Error('Call login() first.');

        const link = await this._page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('a')).find(el => el.textContent?.trim() === 'Schedule');
        });
        const el = link.asElement();
        if (!el) throw new Error('Schedule link not found in sidebar.');
        await el.click();

        // Wait for schedule tables to load, instead of an arbitrary timeout
        const found = await this._page.waitForSelector('table[id^="grid_WEEKDAYStudentClasses_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getSchedule: timed out waiting for schedule tables — data may be empty.');

        return this._page.evaluate(() => {
            const results: {
                course: string;
                teacher: string;
                period: string;
                time?: string;
                term: string;
                room?: string;
            }[] = [];

            // Period labels live in tables whose id starts with grid_WEEKDAY_scheduleGrid
            // Class data lives in grid_WEEKDAYStudentClasses_{sid}_{eid}_{period}_{term}
            const classTables = Array.from(
                document.querySelectorAll('table[id^="grid_WEEKDAYStudentClasses_"]')
            );

            // Detect active term from headers
            const activeTermHeader = document.querySelector('th.sf_highlightYellow strong');
            const activeTerm = activeTermHeader ? activeTermHeader.textContent?.trim() : null;

            // Build a period-to-time map from the label tables
            const periodTimes: Record<number, string> = {};
            document.querySelectorAll('table[id^="grid_WEEKDAY_scheduleGrid_"]').forEach(t => {
                t.querySelectorAll('tr').forEach((row, idx) => {
                    const text = (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
                    const match = text.match(/Period (\d+)\(([^)]+)\)/);
                    if (match) periodTimes[parseInt(match[1])] = match[2];
                });
            });

            // Parse id: grid_WEEKDAYStudentClasses_{sid}_{eid}_{period}_{term}
            for (const table of classTables) {
                const idParts = (table.id).split('_');
                // idParts: ['grid','WEEKDAYStudentClasses', sid, eid, period, term]
                const periodNum = parseInt(idParts[idParts.length - 2]);
                const termNum = parseInt(idParts[idParts.length - 1]);

                const firstRow = table.querySelector('tr');
                if (!firstRow) continue;

                const spans = Array.from(firstRow.querySelectorAll('span, a'));

                let course = '';
                let teacher = '';
                let room = '';

                // Case 1: Semantic spans exist
                if (spans.length > 0) {
                    const courseSpan = firstRow.querySelector('.bld');
                    course = courseSpan ? (courseSpan as HTMLElement).innerText.trim() : (spans[0] as HTMLElement).innerText.trim();
                    if (spans.length > 1) teacher = (spans[1] as HTMLElement).innerText.trim();
                    if (spans.length > 2) room = (spans[2] as HTMLElement).innerText.trim().replace(/^Room\s*/i, '');
                }

                // Case 2: Fallback to newline splitting if teacher/room missing
                if (!teacher || !room) {
                    const parts = (firstRow as HTMLElement).innerText.split('\n').map(p => p.trim()).filter(Boolean);
                    if (!course) course = parts[0] || '';
                    if (!teacher) teacher = parts[1] || '';
                    if (!room && parts[2]) room = parts[2].replace(/^Room\s*/i, '');
                }

                // Cleanup: If teacher or room got caught in the course string (concatenation)
                if (course && teacher && course.includes(teacher)) {
                    course = course.split(teacher)[0].trim();
                }

                if (course && course.length > 1) {
                    results.push({
                        course,
                        teacher,
                        period: `Period ${periodNum}`,
                        time: periodTimes[periodNum],
                        term: `Term ${termNum}`,
                        room: room || undefined,
                    });
                }
            }

            // Deduplicate (same course/period appears once per term)
            const seen = new Set<string>();
            const schedule = results.filter(r => {
                const key = `${r.course}|${r.period}|${r.term}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            return { schedule, activeTerm };
        }) as Promise<ScheduleResult>;
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
        if (!this._page) throw new Error('Call login() first.');

        const link = await this._page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('a')).find(el => el.textContent?.trim() === 'Attendance');
        });
        const el = link.asElement();
        if (!el) throw new Error('Attendance link not found in sidebar.');
        await el.click();

        // Wait for attendance tables to load, instead of an arbitrary timeout
        const found = await this._page.waitForSelector('table[id^="grid_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getAttendance: timed out waiting for attendance table — data may be empty.');

        return this._page.evaluate(() => {
            const results: {
                date: string;
                type: string;
                period: string;
                course: string;
            }[] = [];

            // Find all tables that are likely the attendance records (not nav/header tables)
            const tables = Array.from(document.querySelectorAll('table[id^="grid_"]'));
            for (const table of tables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                let headers: string[] = [];

                for (const row of rows) {
                    // Detect the header row
                    const ths = Array.from(row.querySelectorAll('th'));
                    if (ths.length > 0) {
                        headers = ths.map(th => (th as HTMLElement).innerText.trim().toLowerCase());
                        continue;
                    }
                    if (headers.length === 0) continue;

                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length < 2) continue;
                    const values = cells.map(c => (c as HTMLElement).innerText.trim());

                    const entry: { date: string; type: string; period: string; course: string } = {
                        date: '', type: '', period: '', course: ''
                    };

                    headers.forEach((h, i) => {
                        const val = values[i] || '';
                        if (h.includes('date')) entry.date = val;
                        else if (h.includes('type') || h.includes('status') || h.includes('reason')) entry.type = val;
                        else if (h.includes('period')) entry.period = val;
                        else if (h.includes('class') || h.includes('course') || h.includes('description')) entry.course = val;
                    });

                    if (entry.date || entry.type) results.push(entry);
                }
            }

            return results;
        });
    }

    /**
     * Closes the browser and releases all resources.
     * Always call this when you are finished using the scraper.
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this._page = null;
        }
    }
}
