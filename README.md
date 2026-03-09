# alpine-skyward-scraper

> Playwright-based Node.js library for scraping student data from the **Alpine School District's Skyward Family Access** portal.

[![npm version](https://img.shields.io/npm/v/alpine-skyward-scraper.svg)](https://www.npmjs.com/package/alpine-skyward-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Install

```bash
npm install alpine-skyward-scraper
npx playwright install chromium
```

## Prerequisites

- **Node.js** 18 or later
- Chromium (installed via the `playwright install` command above)
- Valid Skyward Family Access credentials for Alpine School District

---

## Quick Start

```typescript
import { AlpineSkywardScraper } from 'alpine-skyward-scraper';

const scraper = new AlpineSkywardScraper();

await scraper.init();
await scraper.login(process.env.SKYWARD_USER!, process.env.SKYWARD_PASS!);

const students = await scraper.getStudents();
await scraper.selectStudent(students[0].name);

const grades    = await scraper.getGradebook();
const schedule  = await scraper.getSchedule();
const attendance = await scraper.getAttendance();

console.log(grades);

await scraper.close();
```

> **Tip:** Store credentials in a `.env` file and use the `dotenv` package. Never commit credentials to source control.

---

## API Reference

### `new AlpineSkywardScraper()`

Creates a new scraper instance. The instance maintains a persistent browser session — create once, call data methods repeatedly, then `close()` when done.

---

### `init(headless?: boolean): Promise<void>`

Launches the Chromium browser.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `headless` | `boolean` | `true` | Pass `false` to show the browser window (useful for debugging). |

---

### `login(username, password, url?): Promise<boolean>`

Navigates to the Skyward login page and authenticates.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `username` | `string` | - | Skyward username |
| `password` | `string` | - | Skyward password |
| `url` | `string` | `ALPINE_URL` | Full URL to the Skyward login page. Defaults to Alpine School District. |

**Returns:** `true` on success.  
**Throws:** `Error` if login fails or `init()` was not called.

---

### `getStudents(): Promise<Student[]>`

Lists all students on the account.

**Returns:** Array of `Student` objects.  
**Throws:** `Error` if not logged in.

---

### `selectStudent(name): Promise<boolean>`

Switches the active student context. Must be called before `getGradebook()`, `getSchedule()`, or `getAttendance()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Full name as returned by `getStudents()` (e.g. `"Jane Doe"`) |

**Returns:** `true` if the student was selected.  
**Throws:** `Error` if the student is not found.

---

### `getGradebook(term?): Promise<GradeEntry[]>`

Fetches the gradebook for the currently selected student. Supports both secondary quarter-based layouts and elementary standards-based layouts.

By default, this method bulk-loads grade detail modals only for the current term and attaches assignment- or skill-level detail to each `GradeEntry` in `assignmentEntries`. You can pass a term like `"Q3"` or `"TERM 1"` to target a different term explicitly.

Some Skyward grade targets do not reliably open a modal. Those entries are skipped with a warning instead of failing the entire gradebook fetch.

| Parameter | Type | Description |
|-----------|------|-------------|
| `term` | `string` | Optional term label to scrape detail modals for (e.g. `"Q3"`, `"TERM 1"`). Defaults to the current highlighted term when detectable. |

**Returns:** Array of `GradeEntry` objects.  
**Throws:** `Error` if not logged in or navigation fails.

---

### `getSchedule(): Promise<ScheduleEntry[]>`

Fetches the class schedule for the currently selected student.

**Returns:** Array of `ScheduleEntry` objects.  
**Throws:** `Error` if not logged in or navigation fails.

---

### `getAttendance(): Promise<AttendanceEntry[]>`

Fetches attendance history for the currently selected student.

**Returns:** Array of `AttendanceEntry` objects.  
**Throws:** `Error` if not logged in or navigation fails.

---

### `close(): Promise<void>`

Closes the browser and releases all resources. Always call this when finished.

---

## Type Definitions

```typescript
interface Student {
    name: string;        // e.g. "Jane Doe"
    id: string | null;   // Internal Skyward student ID
}

interface GradeEntry {
    course: string;                            // e.g. "ENGLISH 11"
    grades: { period: string; grade: string }[]; // e.g. [{ period: "Q1", grade: "A" }]
    assignmentEntries?: AssignmentEntry[];     // Bulk-loaded assignment or skill detail
}

interface AssignmentEntry {
    id?: string | null;           // Skyward assignment ID when available
    name: string;                 // Assignment, event, or skill name
    period?: string | null;       // e.g. "Q3" or "Current"
    dueDate?: string | null;      // e.g. "03/04/26"
    category?: string | null;     // e.g. "Assignments", "Quiz", "Skill"
    categoryWeight?: number | null; // e.g. 20 for weighted categories
    grade?: string | null;        // e.g. "A", "C-", "3", "NA"
    scorePercent?: number | null; // e.g. 74
    pointsEarned?: number | null; // e.g. 14.8
    pointsPossible?: number | null; // e.g. 20
    pointsText?: string | null;   // e.g. "14.8 out of 20"
    missing?: boolean | null;
    noCount?: boolean | null;
    absentStatus?: string | null; // e.g. "Unexcused Absence"
    subject?: string | null;      // Common in elementary standards views
    skillCode?: string | null;    // e.g. "4.SL.1"
    skillDescription?: string | null;
    isSkill?: boolean;
    isGradedSubject?: boolean | null;
}

interface ScheduleEntry {
    course: string;    // e.g. "SECONDARY MATH 3"
    teacher: string;   // e.g. "John Doe"
    period: string;    // e.g. "Period 4"
    time?: string;     // e.g. "12:55 PM - 2:15 PM"
    term: string;      // e.g. "Q3"
    room?: string;     // Room number if available
}

interface AttendanceEntry {
    date: string;      // e.g. "2026-02-14"
    type: string;      // e.g. "Excused", "Tardy"
    period: string;    // e.g. "Period 3"
    course: string;    // e.g. "ENGLISH 11"
}
```

### Grade Detail Notes

- Secondary-style grade modals usually return classic assignment rows with due dates, grades, percentages, points, and optional weighted categories.
- Elementary standards-based modals return skill-style entries instead of classic assignments. In those cases `AssignmentEntry.isSkill` is `true`, and fields like `subject`, `skillCode`, and `skillDescription` are more useful than points.

---

## Error Handling

All methods **throw** `Error` on failure. Wrap calls in `try/catch`:

```typescript
try {
    const grades = await scraper.getGradebook();
} catch (err) {
    console.error('Failed to fetch gradebook:', err);
}
```

---

## License

MIT
