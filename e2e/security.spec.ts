import { expect, test } from '@playwright/test';

/** The strict CSP (SEC-11) must not break the app: no violations, pages hydrate. */
test('pages hydrate under the strict CSP without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on('pageerror', (e) => violations.push(e.message));

  for (const path of ['/', '/host', '/history', '/local']) {
    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain("'strict-dynamic'");
    expect(response?.headers()['x-frame-options']).toBe('DENY');
  }
  // Hydrated: the hot-seat setup form reacts to input.
  await page.getByRole('radio', { name: '3' }).check({ force: true });
  await expect(page.getByRole('textbox', { name: 'Player 3 name' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('API responses are locked down', async ({ request }) => {
  const res = await request.get('/api/session');
  expect(res.headers()['content-security-policy']).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
  expect(res.headers()['cache-control']).toBe('no-store');
  const write = await request.post('/api/admin/login', {
    data: { secret: 'x' },
    headers: { origin: 'https://evil.example' },
  });
  expect(write.status()).toBe(403);
});
