import { test, expect } from '@playwright/test';
import { openApp, selectShow, menu, closeDialog } from './helpers';

test('brand, all categories, regions and artwork load', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle('NeuJoh');
  await expect
    .poll(() =>
      page
        .locator('.brand-logo')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('.map-filters button')).toHaveCount(7);
  await expect(page.locator('.region-picker option')).toHaveCount(16);
  await expect(page.locator('#map canvas')).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator('.map-filters img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});
test('all category filters reuse one map and report the viewed area', async ({
  page,
}) => {
  await openApp(page);
  for (const category of [
    'Bathrooms',
    'Parking',
    'Vibes',
    'Tourism',
    'Pop-ups',
    'Events',
    'All places',
  ]) {
    const button = page
      .getByRole('navigation', { name: 'Categories' })
      .getByRole('button', { name: category, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.nearby-count')).toHaveText(/^\d+\+? nearby$/);
    await expect(page.locator('#map canvas')).toHaveCount(1);
  }
});
test('Busan discovery opens the next recurring show', async ({ page }) => {
  await openApp(page);
  await selectShow(page);
  await expect(page.locator('.event-schedule')).toContainText('Korea time');
  await expect(page.locator('.event-schedule')).toContainText(/scheduled/i);
});
test('save, reload and unsave preserve the selected collection', async ({
  page,
}) => {
  await openApp(page);
  await selectShow(page);
  await page
    .locator('.selected-card')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    page
      .locator('.selected-card')
      .getByRole('button', { name: 'Unsave', exact: true }),
  ).toBeVisible();
  await page.reload();
  await selectShow(page);
  await page
    .locator('.selected-card')
    .getByRole('button', { name: 'Unsave', exact: true })
    .click();
  await expect(
    page
      .locator('.selected-card')
      .getByRole('button', { name: 'Save', exact: true }),
  ).toBeVisible();
});
test('private notes survive a reload', async ({ page }) => {
  await openApp(page);
  await selectShow(page);
  await page
    .getByRole('button', { name: 'Details & notes', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Private visit notes' })
    .fill('Meet at the beach before the scheduled show.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.reload();
  await selectShow(page);
  await page
    .getByRole('button', { name: 'Details & notes', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Private visit notes' }),
  ).toHaveValue('Meet at the beach before the scheduled show.');
});
test('navigation chooser has real destination links', async ({ page }) => {
  await openApp(page);
  await selectShow(page);
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Google Maps', exact: true }),
  ).toHaveAttribute('href', /destination=35\.154/);
  await expect(
    page.getByRole('link', { name: 'NAVER Map', exact: true }),
  ).toHaveAttribute('href', /^https:\/\/map\.naver\.com/);
  await expect(
    page.getByRole('link', { name: 'Kakao Map', exact: true }),
  ).toHaveAttribute('href', /^https:\/\/map\.kakao\.com/);
});
test('language controls and dropdown contrast work in all three languages', async ({
  page,
}) => {
  await openApp(page);
  for (const [label, language] of [
    ['한국어', 'ko'],
    ['日本語', 'ja'],
    ['English', 'en'],
  ]) {
    await menu(page);
    await page
      .locator('.language-options')
      .getByRole('button', { name: label, exact: true })
      .click();
    await closeDialog(page);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const styles = await page
      .locator('.region-picker select')
      .evaluate((select) => ({
        text: getComputedStyle(select).color,
        backing: getComputedStyle(select).backgroundColor,
        options: Array.from((select as HTMLSelectElement).options).every(
          (option) =>
            getComputedStyle(option).color !==
            getComputedStyle(option).backgroundColor,
        ),
      }));
    expect(styles.text).not.toEqual(styles.backing);
    expect(styles.options).toBe(true);
  }
});
test('place pages remain bounded and next/previous work', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await expect(page.locator('.place-row')).toHaveCount(4);
  const first = await page.locator('.place-row').first().innerText();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.place-row').first()).not.toHaveText(first);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.place-row').first()).toHaveText(first);
});
test('location button uses the provided browser fix', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2857, longitude: 127.0127 });
  await openApp(page);
  await page.getByRole('button', { name: 'My location', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Explore a region' }),
  ).toHaveValue('suwon');
});
test('escape closes a dialog without changing the view', async ({ page }) => {
  await openApp(page);
  await menu(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Explore a region' }),
  ).toHaveValue('seoul');
});
test('glass is visible, static and respects reduced transparency', async ({
  page,
  context,
}) => {
  await openApp(page);
  const glass = await page.locator('.map-filters').evaluate((element) => ({
    blur: getComputedStyle(element).backdropFilter,
    animation: getComputedStyle(element).animationName,
    opacity: getComputedStyle(element).getPropertyValue('--lg-opacity').trim(),
  }));
  expect(glass.blur).toContain('blur');
  expect(glass.animation).toBe('none');
  expect(Number(glass.opacity)).toBeLessThan(0.6);
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await expect(page.locator('.map-filters')).toHaveCSS(
    'backdrop-filter',
    'none',
  );
  await expect(page.locator('.map-filters')).toHaveCSS(
    'background-color',
    'rgb(20, 24, 31)',
  );
});
test('landscape and phone layouts keep the destination card on screen', async ({
  page,
}) => {
  await openApp(page);
  await selectShow(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.saved-button .ui-icon')).toBeVisible();
    await expect(
      page.locator('.selected-actions button').nth(1).locator('.ui-icon'),
    ).toBeVisible();
    await expect(
      page.locator('.selected-actions button').nth(2).locator('.ui-icon'),
    ).toBeVisible();
    const card = await page.locator('.selected-card').boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(card!.y + card!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
