import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Two real browser tabs play online using the same-origin BroadcastChannel
 * transport (`?transport=broadcast`): host creates a room in-browser, friend
 * joins with the password, both see the same moves live, and the friend's
 * hidden blind reserve stays hidden from the host.
 */

const takeButton = (page: Page, gem: string) =>
  page.getByRole('button', { name: new RegExp(`^Take ${gem} \\(`) });

async function waitForVersion(page: Page, version: number) {
  await expect(page.locator('[data-version]')).toHaveAttribute('data-version', String(version));
}

test('host and friend play an online P2P game in real time', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'Runs once.');
  test.setTimeout(120_000);
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const host = await context.newPage();
  const friend = await context.newPage();

  // Host creates a room directly in the browser.
  await host.goto('/splendor/host/?transport=broadcast');
  await host.getByLabel('Room name').fill('E2E night');
  await host.getByLabel(/Room password/).fill('swordfish');
  await host.getByLabel('Your name').fill('Anna');
  await host.getByLabel('Seat order').selectOption('joined');
  await host.getByLabel('First player').selectOption('firstSeat');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host).toHaveURL(/\/splendor\/play\/#[A-Z2-9]{10}$/);
  const code = host.url().split('#')[1]!;
  await expect(host.getByRole('heading', { name: 'E2E night' })).toBeVisible();

  // Friend joins through the hash link; a wrong password is refused.
  await friend.goto(`/splendor/play/?transport=broadcast#${code}`);
  await friend.getByLabel('Your name').fill('Ben');
  await friend.getByLabel(/Room password/).fill('wrong-password');
  await friend.getByRole('button', { name: 'Join' }).click();
  await expect(friend.getByRole('alert').filter({ hasText: 'incorrect' })).toBeVisible();

  await friend.getByLabel(/Room password/).fill('swordfish');
  await friend.getByRole('button', { name: 'Join' }).click();
  await expect(friend.getByRole('heading', { name: 'E2E night' })).toBeVisible();

  // Lobby: friend readies up, host starts.
  await expect(host.getByRole('region', { name: 'Chat' })).toContainText('Ben joined.');
  await friend.getByRole('button', { name: "I'm ready" }).click();
  await host.getByRole('button', { name: 'Start game' }).click();
  await waitForVersion(host, 0);
  await waitForVersion(friend, 0);

  // Anna (first seat) takes gems; Ben sees it immediately.
  for (const gem of ['diamond', 'sapphire', 'emerald']) await takeButton(host, gem).click();
  await host.getByRole('button', { name: 'Take gems' }).click();
  await waitForVersion(friend, 1);
  await expect(friend.getByRole('region', { name: 'Game log' })).toContainText(
    'Anna took 1 diamond, 1 sapphire and 1 emerald.',
  );

  // Ben reserves blind; Anna only sees a hidden card.
  await friend.getByRole('button', { name: /^Level II deck/ }).click();
  await friend.getByRole('dialog').getByRole('button', { name: 'Reserve' }).click();
  await waitForVersion(host, 2);
  await expect(host.getByRole('img', { name: 'Hidden Level II card' })).toBeVisible();
  await expect(host.getByRole('region', { name: 'Game log' })).toContainText(
    'Ben reserved a Level II card from the deck and took 1 gold.',
  );
  await expect(friend.getByRole('region', { name: 'Game log' })).toContainText(
    /Ben reserved a Level II \w+ card/,
  );

  // It is not Ben's turn any more: his bank buttons are inert.
  await expect(takeButton(friend, 'ruby')).toHaveAttribute('aria-disabled', 'true');

  // Chat works both ways and renders text literally.
  await friend.getByLabel('Chat message').fill('<b>hi</b> Anna');
  await friend.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(host.getByRole('region', { name: 'Chat' })).toContainText('<b>hi</b> Anna');

  // Reloading keeps the seat and the game.
  await friend.reload();
  await waitForVersion(friend, 2);
  await expect(friend.getByRole('region', { name: 'Game log' })).toContainText(
    /Ben reserved a Level II \w+ card/,
  );

  await context.close();
});
