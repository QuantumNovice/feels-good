import { test, expect } from '@playwright/test';
import { openApp, menu, closeDialog } from './helpers';
async function editor(page: import('@playwright/test').Page) {
  await menu(page);
  await page.getByRole('button', { name: 'Add a place', exact: true }).click();
  await page
    .getByRole('button', { name: 'Use this location', exact: true })
    .click();
}
test('personal places can be created, edited and restored after reload', async ({
  page,
}) => {
  await openApp(page);
  await editor(page);
  await page
    .getByRole('textbox', { name: 'Place name' })
    .fill('Evening walk meeting point');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await expect(page.locator('.selected-card h2')).toHaveText(
    'Evening walk meeting point',
  );
  await page
    .getByRole('button', { name: 'Details & notes', exact: true })
    .click();
  await page.getByText('More', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Edit local copy', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Place name' })
    .fill('Evening walk entrance');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await expect(
    page
      .getByRole('complementary')
      .getByRole('button', { name: 'Evening walk entrance', exact: true }),
  ).toBeVisible();
});
test('timed personal places require an end date', async ({ page }) => {
  await openApp(page);
  await editor(page);
  await page
    .getByRole('textbox', { name: 'Place name' })
    .fill('Personal event reminder');
  await page
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption('event');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('End date (Korea time)').fill('2027-01-01');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await expect(page.locator('.selected-card h2')).toHaveText(
    'Personal event reminder',
  );
});
test('cancelled pin creation leaves the collection unchanged', async ({
  page,
}) => {
  await openApp(page);
  await menu(page);
  await page.getByRole('button', { name: 'Add a place', exact: true }).click();
  await page
    .locator('.pin-toolbar')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(page.locator('.pin-toolbar')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('preview'))).toBeNull();
});
test('browser details do not offer native-only audio controls', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.locator('.place-row').first().click();
  await page
    .getByRole('button', { name: 'Details & notes', exact: true })
    .click();
  await page.getByText('More', { exact: true }).click();
  await expect(page.getByRole('button', { name: /music/i })).toHaveCount(0);
  await closeDialog(page);
});
