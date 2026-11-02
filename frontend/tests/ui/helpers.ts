import { expect, type Page } from '@playwright/test';
export async function openApp(page: Page) {
  // The app defaults to Korean; these checks use English labels.
  await page.addInitScript(() => localStorage.setItem('languageChoice', 'en'));
  await page.goto('/');
  await expect(page).toHaveTitle('NeuJoh');
  await expect(page.locator('.map-tools .menu-toggle')).toBeVisible();
  await expect(page.locator('.nearby-count')).toHaveText(/^\d+\+? nearby$/);
}
export async function closeDialog(page: Page) {
  await page.locator('dialog .dialog-heading button').click();
}
export async function menu(page: Page) {
  await page.locator('.map-tools .menu-toggle').click();
}
export async function sources(page: Page) {
  await menu(page);
  await page.getByRole('button', { name: 'Data sources', exact: true }).click();
}
export async function selectShow(page: Page) {
  await page
    .getByRole('combobox', { name: 'Explore a region' })
    .selectOption('busan');
  await page.getByRole('button', { name: 'Vibes', exact: true }).click();
  await expect(page.locator('.nearby-count')).toHaveText(/^[1-9]\d* nearby$/);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Gwangalli M Drone Light Show', exact: true })
    .click();
  await expect(page.locator('.selected-card h2')).toHaveText(
    'Gwangalli M Drone Light Show',
  );
}
export const importedPlace = {
  id: 'wikipedia:496798',
  name: 'Deoksugung',
  category: 'tourism',
  latitude: 37.5661,
  longitude: 126.975,
  source: 'Wikipedia / Wikimedia Commons',
  evidenceUrl: 'https://en.wikipedia.org/?curid=496798',
  verified: false,
};
export const sourceURL = 'https://feeds.example.org/places.json';
export async function importFeed(page: Page, url = sourceURL) {
  await sources(page);
  await page
    .getByRole('textbox', { name: 'Public HTTPS JSON URL', exact: true })
    .fill(url);
  await page
    .getByRole('button', { name: 'Import / refresh', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Explore a region' }),
  ).toHaveCount(0);
}
