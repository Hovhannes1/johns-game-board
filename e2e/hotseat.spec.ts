import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function startGame(page: Page, names: string[]) {
  await page.goto('/splendor/local/');
  await page.getByRole('radio', { name: String(names.length) }).check({ force: true });
  for (const [i, name] of names.entries()) {
    await page.getByRole('textbox', { name: `Player ${i + 1} name` }).fill(name);
  }
  await page.getByRole('radio', { name: 'First in the list' }).check();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('status').filter({ hasText: `${names[0]}'s turn` })).toBeVisible();
}

const takeButton = (page: Page, gem: string) =>
  page.getByRole('button', { name: new RegExp(`^Take ${gem} \\(`) });

const log = (page: Page) => page.getByRole('region', { name: 'Game log' });

test.beforeEach(async ({ page }) => {
  await page.goto('/splendor/local/');
  await page.evaluate(() => localStorage.clear());
});

test('plays several hot-seat turns and survives a reload', async ({ page }) => {
  await startGame(page, ['Anna', 'Ben']);

  // Anna takes three different gems.
  for (const gem of ['diamond', 'sapphire', 'emerald']) await takeButton(page, gem).click();
  await page.getByRole('button', { name: 'Take gems' }).click();
  await expect(log(page)).toContainText('Anna took 1 diamond, 1 sapphire and 1 emerald.');
  await expect(page.getByRole('status').filter({ hasText: "Ben's turn" })).toBeVisible();

  // Ben takes two rubies.
  await takeButton(page, 'ruby').click();
  await takeButton(page, 'ruby').click();
  await page.getByRole('button', { name: 'Take gems' }).click();
  await expect(log(page)).toContainText('Ben took 2 ruby.');

  // Anna reserves blind from the level I deck and gets a gold.
  await page.getByRole('button', { name: /^Level I deck, 36 cards left/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Reserve from the Level I deck' });
  await dialog.getByRole('button', { name: 'Reserve' }).click();
  // The screen now shows Ben's view, where Anna's blind reserve stays secret.
  const redacted = 'Anna reserved a Level I card from the deck and took 1 gold.';
  await expect(log(page)).toContainText(redacted);
  // On phones, opponents' areas start collapsed.
  const show = page
    .getByRole('region', { name: /^Anna,/ })
    .getByRole('button', { name: 'Show cards' });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole('img', { name: 'Hidden Level I card' })).toBeVisible();

  // The game is saved locally and rebuilt from its action log after a reload.
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: "Ben's turn" })).toBeVisible();
  await expect(log(page)).toContainText('Ben took 2 ruby.');
  await expect(log(page)).toContainText(redacted);

  // On Anna's next turn she sees which card she reserved.
  await takeButton(page, 'onyx').click();
  await takeButton(page, 'onyx').click();
  await page.getByRole('button', { name: 'Take gems' }).click();
  await expect(log(page)).toContainText(
    /Anna reserved a Level I \w+ card from the deck and took 1 gold\./,
  );
  await expect(page.getByRole('img', { name: 'Hidden Level I card' })).toBeHidden();
});

test('explains why a gem selection cannot be taken yet', async ({ page }) => {
  await startGame(page, ['Anna', 'Ben', 'Cleo']);
  await takeButton(page, 'onyx').click();
  await expect(page.getByText('Take exactly 3 different colors.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take gems' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Undo the pick.
  await page.getByRole('button', { name: 'Put back onyx' }).click();
  await expect(page.getByText(/Pick 3 different gems/)).toBeVisible();
});

test('shows the rules and can leave the game', async ({ page }) => {
  await startGame(page, ['Anna', 'Ben']);
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeHidden();

  await page.getByRole('button', { name: 'Leave game' }).click();
  await page
    .getByRole('dialog', { name: 'Leave this game?' })
    .getByRole('button', { name: 'Leave game' })
    .click();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
});

test('a card dialog shows why it cannot be bought yet', async ({ page }) => {
  await startGame(page, ['Anna', 'Ben']);
  await page
    .getByRole('region', { name: 'Development cards' })
    .getByRole('button', { name: /^Level III \w+ card/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Not enough tokens/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Buy' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(dialog.getByText('You also take 1 gold.')).toBeVisible();
});
