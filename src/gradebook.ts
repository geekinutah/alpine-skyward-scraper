import { Page, Locator } from 'playwright';
import type { GradeEntry, AssignmentEntry } from './types';
import { clickSidebarLink, waitForVisibleDialog, closeVisibleDialog } from './browser';

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

async function readBaseGradebookRows(page: Page): Promise<GradebookRow[]> {
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

async function getCurrentGradebookTerm(page: Page): Promise<string | null> {
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

async function collectGradeTargets(page: Page, term?: string | null): Promise<GradeTarget[]> {
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

async function readGradeModalDetails(page: Page, target: GradeTarget): Promise<GradeModalDetails> {
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

async function findGradeTargetLocator(page: Page, target: GradeTarget): Promise<Locator | null> {
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

export async function getGradebook(page: Page, term?: string): Promise<GradeEntry[]> {
    await clickSidebarLink(page, 'Gradebook');

    const found = await page.waitForSelector('tr[data-rownum], tr[data-desc], .classDesc', { state: 'attached', timeout: 15000 }).catch(() => null);
    if (!found) console.warn('[AlpineSkywardScraper] getGradebook: timed out waiting for gradebook rows — data may be empty.');

    const selectedTerm = term?.trim() || await getCurrentGradebookTerm(page);
    const rows = await readBaseGradebookRows(page);
    const targets = await collectGradeTargets(page, selectedTerm);
    const rowsByKey = new Map(rows.map((row) => [row.rowKey, row]));

    const assignmentKey = (a: AssignmentEntry) =>
        [a.period || '', a.category || '', a.dueDate || '', a.id || '', a.name].join('|');

    for (const target of targets) {
        const locator = await findGradeTargetLocator(page, target);
        if (!locator || await locator.count() === 0) continue;

        try {
            await locator.click({ force: true });
            await waitForVisibleDialog(page);

            const modalDetails = await readGradeModalDetails(page, target);
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
            await closeVisibleDialog(page);
        }
    }

    return rows.map(({ rowKey, ...row }) => row);
}
