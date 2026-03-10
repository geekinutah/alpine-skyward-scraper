import { chromium, Browser, BrowserContext, Page } from 'playwright';

export type BrowserState = {
    browser: Browser | null;
    context: BrowserContext | null;
    page: Page | null;
};

export function requirePage(state: BrowserState): Page {
    if (!state.page) throw new Error('Call login() first.');
    return state.page;
}

export async function initBrowser(headless: boolean = true): Promise<BrowserState> {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    return { browser, context, page };
}

export async function closeBrowser(state: BrowserState): Promise<void> {
    if (state.browser) {
        await state.browser.close();
        state.browser = null;
        state.context = null;
        state.page = null;
    }
}

export async function clickSidebarLink(page: Page, linkText: string): Promise<void> {
    const link = await page.evaluateHandle((text) => {
        return Array.from(document.querySelectorAll('a')).find(el => el.textContent?.trim() === text);
    }, linkText);
    const el = link.asElement();
    if (!el) throw new Error(`${linkText} link not found in sidebar.`);
    await el.click();
}

export async function waitForVisibleDialog(page: Page): Promise<void> {
    await page.locator('.sf_DialogWrap[role="dialog"], .ui-dialog, [role="dialog"]')
        .filter({ hasText: /\S/ })
        .first()
        .waitFor({ state: 'visible', timeout: 2000 });
}

export async function closeVisibleDialog(page: Page): Promise<void> {
    const closeButton = page.locator('.sf_DialogWrap[role="dialog"] .sf_DialogClose, .ui-dialog-titlebar-close, [role="dialog"] .sf_DialogClose').first();
    if (await closeButton.count()) {
        await closeButton.click({ force: true }).catch((e) => {
            console.info('[AlpineSkywardScraper] closeVisibleDialog: close button click failed:', e instanceof Error ? e.message : e);
        });
    } else {
        await page.keyboard.press('Escape').catch((e) => {
            console.info('[AlpineSkywardScraper] closeVisibleDialog: Escape keypress failed:', e instanceof Error ? e.message : e);
        });
    }
    await page.locator('.sf_DialogWrap[role="dialog"], .ui-dialog, [role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 2000 })
        .catch(() => null);
}
