import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Plays a whole 2-player hot-seat game through the UI with a simple policy:
 * buy when possible, otherwise take gems, otherwise reserve, otherwise pass.
 * Exercises every guided flow (return tokens, noble choice, end screen).
 */

const enabled = (scope: Locator | Page, selector: string) =>
  scope.locator(`${selector}:not([aria-disabled="true"])`);

async function version(page: Page): Promise<string> {
  return (await page.locator('[data-version]').getAttribute('data-version')) ?? '';
}

async function waitForMove(page: Page, before: string) {
  await expect(page.locator('[data-version]')).not.toHaveAttribute('data-version', before);
}

async function playOneMove(page: Page): Promise<'moved' | 'over'> {
  if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) return 'over';
  const before = await version(page);

  const returnDialog = page.getByRole('dialog', { name: 'Too many tokens' });
  if (await returnDialog.isVisible()) {
    const confirm = returnDialog.getByRole('button', { name: 'Return tokens' });
    while ((await confirm.getAttribute('aria-disabled')) === 'true') {
      await enabled(returnDialog, 'button[aria-label^="Return a "]').first().click();
    }
    await confirm.click();
    return waitForMove(page, before).then(() => 'moved');
  }

  const nobleDialog = page.getByRole('dialog', { name: 'A noble visits' });
  if (await nobleDialog.isVisible()) {
    await nobleDialog.getByRole('button').first().click();
    return waitForMove(page, before).then(() => 'moved');
  }

  const pass = page.getByRole('button', { name: 'Pass', exact: true });
  if (await pass.isVisible()) {
    await pass.click();
    return waitForMove(page, before).then(() => 'moved');
  }

  const affordable = page.getByRole('button', { name: /You can buy this card/ });
  if ((await affordable.count()) > 0) {
    await affordable.first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Buy' }).click();
    return waitForMove(page, before).then(() => 'moved');
  }

  const bank = page.getByRole('region', { name: 'Bank' });
  for (let picks = 0; picks < 3; picks++) {
    const pile = enabled(bank, 'button[aria-label^="Take "]').first();
    if ((await pile.count()) === 0) break;
    await pile.click();
  }
  const take = page.getByRole('button', { name: 'Take gems' });
  if ((await take.getAttribute('aria-disabled')) !== 'true') {
    await take.click();
    return waitForMove(page, before).then(() => 'moved');
  }

  // No gems to take: reserve from the first deck that allows it.
  await page.getByRole('button', { name: 'Clear' }).click();
  for (const level of ['III', 'II', 'I']) {
    const deck = page.getByRole('button', { name: new RegExp(`^Level ${level} deck`) });
    if (!(await deck.isEnabled())) continue;
    await deck.click();
    const reserve = page.getByRole('dialog').getByRole('button', { name: 'Reserve' });
    if ((await reserve.getAttribute('aria-disabled')) !== 'true') {
      await reserve.click();
      return waitForMove(page, before).then(() => 'moved');
    }
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  }
  throw new Error('No move found');
}

test('a complete hot-seat game reaches the end screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One full game is enough; desktop only.');
  test.setTimeout(240_000);

  await page.goto('/local');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Anna');
  await page.getByRole('textbox', { name: 'Player 2 name' }).fill('Ben');
  await page.getByRole('button', { name: 'Start game' }).click();

  let moves = 0;
  while ((await playOneMove(page)) === 'moved') {
    moves += 1;
    expect(moves).toBeLessThan(600);
  }

  const end = page.getByRole('dialog', { name: 'Game over' });
  await expect(end.getByText(/wins with|share the victory|ended early/)).toBeVisible();
  await expect(end.getByRole('table')).toContainText('Anna');
  await expect(page.getByRole('region', { name: 'Game log' })).toContainText('Game over');

  // The final board can be inspected and the results reopened.
  await end.getByRole('button', { name: 'View final board' }).click();
  await page.getByRole('button', { name: 'Show results' }).click();

  // Play again keeps the same seats with a fresh game.
  await end.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('[data-version]')).toHaveAttribute('data-version', '0');
  await expect(page.getByRole('region', { name: 'Anna, 0 points' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ben, 0 points' })).toBeVisible();
});
