import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type { Student, GradeEntry, ScheduleResult, AttendanceEntry, AssignmentEntry } from './types';

type GradeTarget = {
    rowKey: string;
    course: string;
    grade: string;
    period: string;
    selectorGroup: string;
    rowIndex: number;
    gid: string | null;
};

type GradebookRow = GradeEntry & {
    rowKey: string;
};

type GradeModalDetails = {
    course: string;
    assignmentEntries: AssignmentEntry[];
};


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
     * Default URL for the Alpine School District Skyward Family Access portal.
     */
    public static readonly ALPINE_URL = 'https://skyward.alpinedistrict.org/scripts/wsisa.dll/WService=wsEAplus/seplog01';

    /**
     * Provides access to the underlying Playwright `Page` instance.
     * Useful for advanced use cases like navigating to custom pages or dumping HTML.
     * Will be `null` until `init()` is called.
     */
    get page(): Page | null {
        return this._page;
    }

    private requirePage(): Page {
        if (!this._page) throw new Error('Call login() first.');
        return this._page;
    }

    private async clickSidebarLink(linkText: string): Promise<void> {
        const page = this.requirePage();

        const link = await page.evaluateHandle((text) => {
            return Array.from(document.querySelectorAll('a')).find(el => el.textContent?.trim() === text);
        }, linkText);
        const el = link.asElement();
        if (!el) throw new Error(`${linkText} link not found in sidebar.`);
        await el.click();
    }

    private async waitForVisibleDialog(): Promise<void> {
        const page = this.requirePage();

        await page.waitForFunction(() => {
            const dialogs = Array.from(document.querySelectorAll('.sf_DialogWrap[role="dialog"], .ui-dialog, [role="dialog"]'));
            return dialogs.some((el) => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                return style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.innerText.trim().length > 0;
            });
        }, undefined, { timeout: 5000 });
    }

    private async closeVisibleDialog(): Promise<void> {
        const page = this.requirePage();

        const closeButton = page.locator('.sf_DialogWrap[role="dialog"] .sf_DialogClose, .ui-dialog-titlebar-close, [role="dialog"] .sf_DialogClose').first();
        if (await closeButton.count()) {
            await closeButton.click({ force: true }).catch(() => null);
        } else {
            await page.keyboard.press('Escape').catch(() => null);
        }
        await page.waitForTimeout(250);
    }

    private async readBaseGradebookRows(): Promise<GradebookRow[]> {
        const page = this.requirePage();

        return page.evaluate(() => {
            const courses = new Map<string, GradebookRow>();

            const rows = Array.from(document.querySelectorAll('tr[data-rownum], tr[data-desc]'));
            for (const [index, row] of rows.entries()) {
                const htmlRow = row as HTMLElement;
                const rowKey = htmlRow.dataset.rownum
                    || htmlRow.dataset.desc
                    || `${index}`;

                if (!courses.has(rowKey)) {
                    courses.set(rowKey, { rowKey, course: '', grades: [], assignmentEntries: [] });
                }

                const data = courses.get(rowKey)!;
                const courseName = htmlRow.dataset.desc
                    || row.querySelector('.classDesc')?.textContent?.trim()
                    || '';

                if (courseName && !data.course) data.course = courseName;

                const gradeLinks = Array.from(row.querySelectorAll('a[id^="showGradeInfo"]'));
                for (const a of gradeLinks) {
                    const grade = a.textContent?.trim() || '';
                    const period = (a as HTMLElement).dataset.lit || '';
                    if (grade && period && !data.grades.some((item) => item.period === period && item.grade === grade)) {
                        data.grades.push({ period, grade });
                    }
                }

                if (gradeLinks.length === 0) {
                    for (const cell of Array.from(row.querySelectorAll('.fB, .fWn.fIl'))) {
                        const grade = cell.querySelector('a')?.textContent?.trim() || '';
                        if (grade && grade.length < 5 && !data.grades.some((item) => item.period === 'Current' && item.grade === grade)) {
                            data.grades.push({ period: 'Current', grade });
                        }
                    }
                }
            }

            return Array.from(courses.values()).filter((course) => course.course !== '');
        });
    }

    private async getCurrentGradebookTerm(): Promise<string | null> {
        const page = this.requirePage();

        return page.evaluate(() => {
            const normalize = (value: string | null | undefined) => value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() || '';

            const highlighted = Array.from(document.querySelectorAll('th.sf_highlightYellow, td.sf_highlightYellow, .sf_highlightYellow'))
                .map((node) => normalize(node.textContent))
                .find((text) => /\b(Q[1-4]|TERM\s*\d+|CURRENT)\b/i.test(text));

            if (highlighted) {
                const match = highlighted.match(/\b(Q[1-4]|TERM\s*\d+|CURRENT)\b/i);
                return match ? match[1].toUpperCase().replace(/\s+/g, ' ') : null;
            }

            const gradeLinks = Array.from(document.querySelectorAll('a[id^="showGradeInfo"]'));
            const periods = gradeLinks
                .map((anchor) => ((anchor as HTMLElement).dataset.lit || '').trim())
                .filter(Boolean);

            return periods.length > 0 ? periods[periods.length - 1].toUpperCase() : null;
        });
    }

    private async collectGradeTargets(term?: string | null): Promise<GradeTarget[]> {
        const page = this.requirePage();

        return page.evaluate((selectedTerm) => {
            const targets: GradeTarget[] = [];
            const seen = new Set<string>();
            const normalizedSelectedTerm = selectedTerm?.trim().toUpperCase() || null;

            const addTarget = (element: Element, rowKey: string, course: string, defaultPeriod: string, selectorGroup: string) => {
                const htmlEl = element as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                if (style.display === 'none' || style.visibility === 'hidden' || htmlEl.offsetParent === null) {
                    return;
                }
                const row = element.closest('tr');
                if (!row) return;
                const rowMatches = Array.from(row.querySelectorAll(selectorGroup)).filter((candidate) => {
                    const candidateEl = candidate as HTMLElement;
                    const candidateStyle = window.getComputedStyle(candidateEl);
                    return candidateStyle.display !== 'none'
                        && candidateStyle.visibility !== 'hidden'
                        && candidateEl.offsetParent !== null;
                });
                const rowIndex = rowMatches.findIndex((candidate) => candidate === element);
                if (rowIndex === -1) return;
                const period = (htmlEl.dataset.lit || defaultPeriod || '').trim();
                const normalizedPeriod = period.toUpperCase();

                if (normalizedSelectedTerm && normalizedPeriod && normalizedPeriod !== normalizedSelectedTerm) {
                    return;
                }

                const key = JSON.stringify({
                    rowKey,
                    selectorGroup,
                    gid: htmlEl.dataset.gid || '',
                    lit: period,
                    rowIndex,
                    grade: htmlEl.innerText.trim(),
                });
                if (seen.has(key)) return;
                seen.add(key);

                targets.push({
                    rowKey,
                    course,
                    grade: htmlEl.innerText.trim(),
                    period,
                    selectorGroup,
                    rowIndex,
                    gid: htmlEl.dataset.gid || null,
                });
            };

            const rows = Array.from(document.querySelectorAll('tr[data-rownum], tr[data-desc]'));
            for (const [index, row] of rows.entries()) {
                const htmlRow = row as HTMLElement;
                const rowKey = htmlRow.dataset.rownum
                    || htmlRow.dataset.desc
                    || `${index}`;
                const course = htmlRow.dataset.desc
                    || row.querySelector('.classDesc')?.textContent?.trim()
                    || '';

                for (const anchor of Array.from(row.querySelectorAll('a[id^="showGradeInfo"]'))) {
                    addTarget(anchor, rowKey, course, '', 'a[id^="showGradeInfo"]');
                }

            }

            const firstTargetPerRow = new Set<string>();
            return targets.filter((target) => {
                const key = `${target.rowKey}|${target.period || ''}`;
                if (firstTargetPerRow.has(key)) return false;
                firstTargetPerRow.add(key);
                return true;
            });
        }, term || null);
    }

    private async readGradeModalDetails(target: GradeTarget): Promise<GradeModalDetails> {
        const page = this.requirePage();

        const details = await page.evaluate((targetArg) => {
            const normalize = (value: string | null | undefined) => value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() || '';
            const parseNumber = (value: string) => {
                const cleaned = normalize(value).replace(/,/g, '');
                if (!cleaned || cleaned === '*' || cleaned.toLowerCase() === 'na') return null;
                const num = Number.parseFloat(cleaned);
                return Number.isFinite(num) ? num : null;
            };
            const parsePoints = (value: string) => {
                const cleaned = normalize(value);
                const match = cleaned.match(/^([*\d.]+)\s+out of\s+([\d.]+)$/i);
                if (!match) {
                    return {
                        pointsEarned: parseNumber(cleaned),
                        pointsPossible: null,
                        pointsText: cleaned || null,
                    };
                }
                return {
                    pointsEarned: match[1] === '*' ? null : parseNumber(match[1]),
                    pointsPossible: parseNumber(match[2]),
                    pointsText: cleaned || null,
                };
            };

            const dialogs = Array.from(document.querySelectorAll('.sf_DialogWrap[role="dialog"], .ui-dialog, [role="dialog"]'));
            const visible = dialogs.find((el) => {
                const htmlEl = el as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                return style.display !== 'none' && style.visibility !== 'hidden' && htmlEl.innerText.trim().length > 0;
            }) as HTMLElement | undefined;

            if (!visible) return null;

            const headingLinks = Array.from(visible.querySelectorAll('h2.gb_heading a'));
            const course = normalize(headingLinks[0]?.textContent) || targetArg.course;
            const subjectRow = Array.from(visible.querySelectorAll('tr')).find((row) => normalize(row.textContent).startsWith('Subject:'));
            const subject = subjectRow
                ? normalize(subjectRow.querySelectorAll('td')[1]?.textContent || '')
                : '';
            const statusLabel = normalize(visible.querySelector('label.blk.fIl')?.textContent);
            const isGradedSubject = statusLabel ? !/not a graded subject/i.test(statusLabel) : null;

            const assignments: AssignmentEntry[] = [];
            const assignmentTable = visible.querySelector('table[id^="grid_stuAssignmentSummaryGrid_"]');

            if (assignmentTable) {
                let currentCategory: string | null = null;
                let currentCategoryWeight: number | null = null;

                for (const row of Array.from(assignmentTable.querySelectorAll('tbody tr'))) {
                    const htmlRow = row as HTMLElement;
                    const cells = Array.from(row.querySelectorAll('td'));
                    const rowText = normalize(htmlRow.innerText);

                    if (htmlRow.classList.contains('sf_Section') && htmlRow.classList.contains('cat')) {
                        currentCategory = normalize(cells[1]?.textContent || cells[0]?.textContent) || null;
                        const weightMatch = rowText.match(/weighted at\s+([\d.]+)%/i);
                        currentCategoryWeight = weightMatch ? parseNumber(weightMatch[1]) : null;
                        continue;
                    }

                    const assignmentLink = row.querySelector('a[id^="showAssignmentInfo"]') as HTMLElement | null;
                    if (!assignmentLink) continue;

                    const dueDate = normalize(cells[0]?.textContent) || null;
                    const name = normalize(assignmentLink.textContent);
                    const grade = normalize(cells[2]?.textContent) || null;
                    const scorePercent = parseNumber(cells[3]?.textContent || '');
                    const points = parsePoints(cells[4]?.textContent || '');
                    const missingText = normalize(cells[5]?.textContent);
                    const noCountText = normalize(cells[6]?.textContent);
                    const absentStatus = normalize(cells[7]?.textContent) || null;

                    assignments.push({
                        id: assignmentLink.dataset.aid || null,
                        name,
                        period: targetArg.period || null,
                        dueDate,
                        category: currentCategory,
                        categoryWeight: currentCategoryWeight,
                        grade,
                        scorePercent,
                        pointsEarned: points.pointsEarned,
                        pointsPossible: points.pointsPossible,
                        pointsText: points.pointsText,
                        missing: missingText ? !/^no$/i.test(missingText) : false,
                        noCount: noCountText ? !/^no$/i.test(noCountText) : false,
                        absentStatus,
                        subject: subject || null,
                        isSkill: false,
                        isGradedSubject,
                    });
                }
            } else {
                for (const row of Array.from(visible.querySelectorAll('tr[class*="isSkillRow_"]'))) {
                    const skillText = normalize(row.querySelector('.bld')?.textContent);
                    const grade = normalize(row.querySelector('td:last-child')?.textContent) || null;
                    const skillMatch = skillText.match(/^([A-Za-z0-9.\-]+)\s+(.*)$/);

                    assignments.push({
                        name: skillText,
                        period: targetArg.period || 'Current',
                        category: 'Skill',
                        grade,
                        subject: subject || null,
                        skillCode: skillMatch ? skillMatch[1] : null,
                        skillDescription: skillMatch ? skillMatch[2] : skillText || null,
                        isSkill: true,
                        isGradedSubject,
                    });
                }
            }

            return {
                course,
                assignmentEntries: assignments,
            };
        }, target);

        if (!details) {
            throw new Error('Could not locate the visible grade detail modal.');
        }

        return details;
    }

    private async findGradeTargetLocator(target: GradeTarget) {
        const page = this.requirePage();

        const rowLocator = page.locator(`tr[data-rownum="${target.rowKey}"], tr[data-desc="${target.rowKey}"]`).first();
        if (await rowLocator.count()) {
            const scoped = rowLocator.locator(target.selectorGroup).filter({ visible: true }).nth(target.rowIndex);
            if (await scoped.count()) return scoped;
        }

        const fallbackIndex = await page.locator(target.selectorGroup).evaluateAll((elements, targetArg) => {
            return elements.findIndex((element) => {
                const htmlEl = element as HTMLElement;
                const style = window.getComputedStyle(htmlEl);
                if (style.display === 'none' || style.visibility === 'hidden' || htmlEl.offsetParent === null) {
                    return false;
                }
                return (htmlEl.dataset.gid || null) === targetArg.gid
                    && (htmlEl.dataset.lit || '') === targetArg.period;
            });
        }, target);

        return fallbackIndex >= 0 ? page.locator(target.selectorGroup).filter({ visible: true }).nth(fallbackIndex) : null;
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
     * @param username - Skyward username
     * @param password - Skyward password
     * @param url - Full URL to the Skyward login page. Defaults to `AlpineSkywardScraper.ALPINE_URL`.
     * @returns `true` on success
     * @throws Error if `init()` has not been called, or if login fails
     */
    async login(username: string, password: string, url: string = AlpineSkywardScraper.ALPINE_URL): Promise<boolean> {
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
        const page = this.requirePage();

        await page.waitForSelector('#sf_StudentList', { timeout: 10000 }).catch(() => null);

        return page.evaluate(() => {
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
        const page = this.requirePage();

        const selectBtn = await page.$('#sf_StudentSelect');
        if (selectBtn) {
            await selectBtn.click({ force: true });
            await page.waitForTimeout(500);
        }

        const options = await page.$$('#sf_StudentList a[role="option"]');
        for (const option of options) {
            const text = (await option.innerText()).trim();
            const dataId = await option.getAttribute('data-nameid');

            const isMatch = typeof student === 'string'
                ? text === student || text.includes(student)
                : (student.id !== null && dataId === student.id) || text === student.name;

            if (isMatch) {
                await option.click({ force: true });
                // Wait for the page to fully reflect the new student context
                await page.waitForLoadState('networkidle');
                // Allow time for Skyward's JS to update the student context
                await page.waitForSelector('#sf_StudentSelect', { state: 'visible', timeout: 5000 }).catch(() => null);
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
    async getGradebook(term?: string): Promise<GradeEntry[]> {
        const page = this.requirePage();

        await this.clickSidebarLink('Gradebook');

        // Wait for gradebook rows to appear, instead of an arbitrary timeout
        const found = await page.waitForSelector('tr[data-rownum], tr[data-desc], .classDesc', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getGradebook: timed out waiting for gradebook rows — data may be empty.');
        const selectedTerm = term?.trim() || await this.getCurrentGradebookTerm();
        const rows = await this.readBaseGradebookRows();
        const targets = await this.collectGradeTargets(selectedTerm);
        const rowsByKey = new Map(rows.map((row) => [row.rowKey, row]));

        const assignmentKey = (a: AssignmentEntry) =>
            [a.period || '', a.category || '', a.dueDate || '', a.id || '', a.name].join('|');

        for (const target of targets) {
            const locator = await this.findGradeTargetLocator(target);
            if (!locator || await locator.count() === 0) continue;

            try {
                await locator.click({ force: true });
                await this.waitForVisibleDialog();
                await page.waitForTimeout(250);

                const modalDetails = await this.readGradeModalDetails(target);
                const row = rowsByKey.get(target.rowKey);

                if (!row) continue;
                if (!row.course && modalDetails.course) row.course = modalDetails.course;

                for (const assignment of modalDetails.assignmentEntries) {
                    const key = assignmentKey(assignment);
                    if (!row.assignmentEntries!.some((entry) => assignmentKey(entry) === key)) {
                        row.assignmentEntries!.push(assignment);
                    }
                }

                if (target.grade && target.period && !row.grades.some((grade) => grade.period === target.period && grade.grade === target.grade)) {
                    row.grades.push({ period: target.period, grade: target.grade });
                }
            } catch (error) {
                const label = target.course || target.period || `${target.gid || 'unknown-grade-target'}`;
                console.warn(`[AlpineSkywardScraper] getGradebook: skipping modal for ${label}:`, error instanceof Error ? error.message : error);
            } finally {
                await this.closeVisibleDialog();
            }
        }

        return rows.map(({ rowKey, ...row }) => row);
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
        const page = this.requirePage();

        await this.clickSidebarLink('Schedule');

        // Wait for schedule tables to load, instead of an arbitrary timeout
        const found = await page.waitForSelector('table[id^="grid_WEEKDAYStudentClasses_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getSchedule: timed out waiting for schedule tables — data may be empty.');

        return page.evaluate((): ScheduleResult => {
            const results: { course: string; teacher: string; period: string; time?: string; term: string; room?: string }[] = [];

            // Period labels live in tables whose id starts with grid_WEEKDAY_scheduleGrid
            // Class data lives in grid_WEEKDAYStudentClasses_{sid}_{eid}_{period}_{term}
            const classTables = Array.from(
                document.querySelectorAll('table[id^="grid_WEEKDAYStudentClasses_"]')
            );

            // Detect active term from headers
            const activeTermHeader = document.querySelector('th.sf_highlightYellow strong');
            const activeTerm = activeTermHeader ? activeTermHeader.textContent?.trim() ?? null : null;

            // Build a period-to-time map from the label tables
            const periodTimes: Record<number, string> = {};
            document.querySelectorAll('table[id^="grid_WEEKDAY_scheduleGrid_"]').forEach(t => {
                t.querySelectorAll('tr').forEach((row) => {
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
        });
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
        const page = this.requirePage();

        await this.clickSidebarLink('Attendance');

        // Wait for attendance tables to load, instead of an arbitrary timeout
        const found = await page.waitForSelector('table[id^="grid_"]', { state: 'attached', timeout: 15000 }).catch(() => null);
        if (!found) console.warn('[AlpineSkywardScraper] getAttendance: timed out waiting for attendance table — data may be empty.');

        return page.evaluate(() => {
            const results: { date: string; type: string; period: string; course: string }[] = [];

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
