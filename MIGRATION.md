# Migration Guide: Monolithic Class → Modular Structure

## What Changed

The library was refactored from a single `AlpineSkywardScraper` class containing all logic into focused modules. **The public class API is unchanged** — existing consumers do not need to update anything.

The internal change: logic was extracted into standalone async functions that accept a Playwright `Page` as their first argument.

---

## Module Map

| Before (private method on class) | After (exported function) | Module |
|----------------------------------|---------------------------|--------|
| `this.init()` | `initBrowser()` | `src/browser.ts` |
| `this.close()` | `closeBrowser()` | `src/browser.ts` |
| `this.requirePage()` | `requirePage()` | `src/browser.ts` |
| `this.clickSidebarLink()` | `clickSidebarLink(page, text)` | `src/browser.ts` |
| `this.waitForVisibleDialog()` | `waitForVisibleDialog(page)` | `src/browser.ts` |
| `this.closeVisibleDialog()` | `closeVisibleDialog(page)` | `src/browser.ts` |
| `this.getStudents()` | `getStudents(page)` | `src/students.ts` |
| `this.selectStudent()` | `selectStudent(page, student)` | `src/students.ts` |
| `this.getGradebook()` | `getGradebook(page, term?)` | `src/gradebook.ts` |
| `this.getSchedule()` | `getSchedule(page)` | `src/schedule.ts` |
| `this.getAttendance()` | `getAttendance(page)` | `src/attendance.ts` |

---

## Using Module Functions Directly

If you need to call scraper logic outside of the class (e.g. in tests, scripts, or custom orchestration), import the function directly and pass a `Page`:

```typescript
import { AlpineSkywardScraper } from './src/AlpineSkywardScraper';
import { getGradebook } from './src/gradebook';
import { getStudents, selectStudent } from './src/students';

const scraper = new AlpineSkywardScraper();
await scraper.init();
await scraper.login(user, pass);

const page = scraper.page!;

// Call module functions directly
const students = await getStudents(page);
await selectStudent(page, students[0]);
const grades = await getGradebook(page);

await scraper.close();
```

> **Note:** `init()` and `login()` remain on the class — they manage the browser lifecycle and handle Skyward's post-login popup behavior. Always use the class to set up the session, then use `scraper.page` to pass into module functions.

---

## For AI Agents

When working in this codebase:

- **Adding a new data scraper** (e.g. `getMessages()`): create `src/messages.ts`, export an async function `getMessages(page: Page)`, then add a one-line delegation method to `AlpineSkywardScraper`.
- **Writing tests**: use `createLoggedInPage()` from `tests/liveTestUtils.ts` to get a `{ page, scraper }` pair, call your module function with `page`, and call `scraper.close()` in `finally`.
- **Shared Playwright helpers** (sidebar navigation, dialog open/close): they live in `src/browser.ts` — import from there rather than duplicating.
- **Types**: all shared interfaces are in `src/types.ts` and re-exported from `src/index.ts`.
- **Login behavior**: Skyward may open a popup window or navigate in the same tab after login — the `login()` method handles both cases.

---

## No Breaking Changes

The public API exported from `src/index.ts` is identical before and after this refactor:

```typescript
// These all still work exactly as before
import { AlpineSkywardScraper } from 'alpine-skyward-scraper';
import type { Student, GradeEntry, ScheduleResult, AttendanceEntry } from 'alpine-skyward-scraper';

const scraper = new AlpineSkywardScraper();
await scraper.init();
await scraper.login(user, pass);
await scraper.selectStudent(students[0]);
const grades = await scraper.getGradebook();
const { schedule, activeTerm } = await scraper.getSchedule();
const attendance = await scraper.getAttendance();
await scraper.close();
```
