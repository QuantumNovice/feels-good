import { test, expect } from '@playwright/test';
import {
  openApp,
  sources,
  importFeed,
  importedPlace,
  sourceURL,
  closeDialog,
} from './helpers';

test('a valid public JSON feed is cached and remains usable when the feed goes offline', async ({
  page,
}) => {
  let offline = false;
  await page.route(sourceURL, (route) =>
    offline
      ? route.abort()
      : route.fulfill({ json: [importedPlace], headers: { ETag: '"v1"' } }),
  );
  await openApp(page);
  await importFeed(page);
  await expect(page.locator('.nearby-count')).toHaveText('1 nearby');
  offline = true;
  await page.reload();
  await expect(page.locator('.nearby-count')).toHaveText('1 nearby');
  await sources(page);
  await expect(
    page.getByText('Cached on this device', { exact: false }),
  ).toBeVisible();
});
test('bad JSON does not replace the cached feed', async ({ page }) => {
  let malformed = false;
  await page.route(sourceURL, (route) =>
    route.fulfill(
      malformed
        ? { body: '{bad', contentType: 'application/json' }
        : { json: [importedPlace] },
    ),
  );
  await openApp(page);
  await importFeed(page);
  malformed = true;
  await sources(page);
  await page
    .getByRole('button', { name: 'Import / refresh', exact: true })
    .click();
  await expect(
    page.getByText('Could not complete action. Previous data retained.', {
      exact: true,
    }),
  ).toBeVisible();
  await closeDialog(page);
  await expect(page.locator('.nearby-count')).toHaveText('1 nearby');
});
test('GitHub file page URLs are normalized to the raw source', async ({
  page,
}) => {
  await page.route(
    'https://raw.githubusercontent.com/example/places/main/places.json',
    (route) => route.fulfill({ json: [importedPlace] }),
  );
  await openApp(page);
  await importFeed(
    page,
    'https://github.com/example/places/blob/main/places.json',
  );
  await sources(page);
  await expect(
    page.getByRole('textbox', { name: 'Public HTTPS JSON URL', exact: true }),
  ).toHaveValue(
    'https://raw.githubusercontent.com/example/places/main/places.json',
  );
});
test('GitHub repository imports honor the JSON path and raw media type', async ({
  page,
}) => {
  let accept = '';
  await page.route(
    'https://api.github.com/repos/example/places/contents/data/seoul.json',
    (route) => {
      accept = route.request().headers()['accept'];
      return route.fulfill({ json: [importedPlace] });
    },
  );
  await openApp(page);
  await sources(page);
  await page
    .getByRole('textbox', { name: 'Public HTTPS JSON URL', exact: true })
    .fill('https://github.com/example/places');
  await page
    .getByRole('textbox', { name: 'JSON path in repository' })
    .fill('data/seoul.json');
  await page
    .getByRole('button', { name: 'Import / refresh', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(accept).toBe('application/vnd.github.raw+json');
});
test('reset returns to bundled records without clearing saved places', async ({
  page,
}) => {
  await page.route(sourceURL, (route) =>
    route.fulfill({ json: [importedPlace] }),
  );
  await openApp(page);
  await importFeed(page);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Deoksugung', exact: true })
    .click();
  await page
    .locator('.selected-card')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await sources(page);
  await page
    .getByRole('button', { name: 'Use bundled places', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Explore a region' }),
  ).toBeVisible();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('preview')!).saved,
  );
  expect(saved).toContain(importedPlace.id);
});
test('insecure URLs are rejected before making a request', async ({ page }) => {
  await openApp(page);
  await sources(page);
  await page
    .getByRole('textbox', { name: 'Public HTTPS JSON URL', exact: true })
    .fill('http://example.org/places.json');
  await page
    .getByRole('button', { name: 'Import / refresh', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('public HTTPS');
});
test('the foreground scheduler refreshes cached data after 15 minutes', async ({
  page,
}) => {
  let calls = 0;
  await page.route(sourceURL, (route) => {
    calls++;
    return route.fulfill({ json: [importedPlace] });
  });
  await page.clock.install();
  await openApp(page);
  await importFeed(page);
  expect(calls).toBe(1);
  await page.clock.fastForward(15 * 60 * 1000 + 1);
  await expect.poll(() => calls).toBe(2);
});
