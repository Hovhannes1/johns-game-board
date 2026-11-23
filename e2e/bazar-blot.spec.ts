import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

async function waitForVersion(page: Page, version: number) {
  await expect(page.locator('[data-version]')).toHaveAttribute('data-version', String(version));
}

test('4 players play an online Bazar Blot round via BroadcastChannel', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Runs once.');
  test.setTimeout(120_000);
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pages = await Promise.all([
    context.newPage(),
    context.newPage(),
    context.newPage(),
    context.newPage(),
  ]);
  const [host, p1, p2, p3] = pages;

  await host.goto('/bazar-blot/host/?transport=broadcast');
  await host.getByLabel('Room name').fill('Blot E2E');
  await host.getByLabel('Your name').fill('Anna');
  await host.getByLabel('Seat order').selectOption('joined');
  await host.getByLabel('First player').selectOption('firstSeat');
  await host.getByLabel('Target score').selectOption('101');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host).toHaveURL(/\/bazar-blot\/play\/#[A-Z2-9]{10}$/);
  const code = host.url().split('#')[1]!;

  for (const [page, name] of [
    [p1, 'Ben'],
    [p2, 'Cleo'],
    [p3, 'Dan'],
  ] as const) {
    await page.goto(`/bazar-blot/play/?transport=broadcast#${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('heading', { name: 'Blot E2E' })).toBeVisible();
    await page.getByRole('button', { name: "I'm ready" }).click();
  }

  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of pages) await waitForVersion(p, 0);

  // Seat 0 (Anna) bids 8 Hearts, seat 1 (Ben) Kontra, seat 2 (Cleo) Pass, seat 0 (Anna) Pass -> playing
  await host.getByRole('button', { name: /^Bid 8/ }).click();
  await waitForVersion(p1, 1);
  await p1.getByRole('button', { name: 'Kontra' }).click();
  await waitForVersion(p2, 2);
  await p2.getByRole('button', { name: 'Pass' }).click();
  await waitForVersion(host, 3);
  await host.getByRole('button', { name: 'Pass' }).click();
  for (const p of pages) await waitForVersion(p, 4);

  // Play all 8 tricks (32 plays) by clicking the first enabled card on whichever page has "Your turn"
  for (let step = 4; step < 36; step++) {
    let acted = false;
    for (const p of pages) {
      const turnBadge = p.getByRole('status').filter({ hasText: 'Your turn' });
      if (await turnBadge.isVisible()) {
        const cardBtn = p.locator('section[aria-label="Your hand"] button:not([disabled])').first();
        await cardBtn.click();
        acted = true;
        break;
      }
    }
    expect(acted).toBe(true);
    for (const p of pages) await waitForVersion(p, step + 1);
  }

  // Round 1 summary dialog appears on all 4 pages
  for (const p of pages) {
    await expect(p.getByRole('dialog', { name: 'Round 1 Summary' })).toBeVisible();
  }

  await context.close();
});
