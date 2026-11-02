import { test, expect } from '@playwright/test';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { openApp, selectShow, menu, closeDialog, sources } from '../ui/helpers';

const artifacts = '../output/playwright/showcase';
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } } });

test('record the release walkthrough and current screenshots', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await mkdir(artifacts, { recursive: true });
  await openApp(page);
  // Pauses here make the exported walkthrough readable. Functional tests do not rely on them.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${artifacts}/browser-map.png` });
  await page.getByRole('button', { name: 'Parking', exact: true }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${artifacts}/browser-parking.png` });
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await selectShow(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${artifacts}/browser-recurring.png` });
  await page
    .locator('.selected-card')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: 'Details & notes', exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page
    .getByRole('textbox', { name: 'Private visit notes' })
    .fill(
      'Meet at the beach before the show. Check the official notice before leaving.',
    );
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await page.waitForTimeout(2500);
  await closeDialog(page);
  await sources(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${artifacts}/browser-sources.png` });
  await closeDialog(page);
  await menu(page);
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await closeDialog(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${artifacts}/browser-korean.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${artifacts}/browser-phone.png` });
  await page.close();
  await page.video()!.saveAs(`${artifacts}/browser-demo.webm`);
  await info.attach('Browser usage demo', {
    path: `${artifacts}/browser-demo.webm`,
    contentType: 'video/webm',
  });
});

test('measure the production map after repeated category changes', async ({
  page,
  context,
}) => {
  await mkdir(artifacts, { recursive: true });
  await openApp(page);
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const sample = async (label: string) => {
    const { metrics } = await client.send('Performance.getMetrics');
    const counters = await client.send('Memory.getDOMCounters');
    return {
      label,
      metrics: Object.fromEntries(
        metrics.map((m: { name: string; value: number }) => [m.name, m.value]),
      ),
      ...counters,
      ...(await page.evaluate(() => ({
        canvasCount: document.querySelectorAll('#map canvas').length,
        iconWidgets: document.querySelectorAll('.leaflet-marker-icon').length,
        placeRows: document.querySelectorAll('.place-row').length,
        nearby: document.querySelector('.nearby-count')?.textContent?.trim(),
      }))),
    };
  };
  await client.send('HeapProfiler.collectGarbage');
  const samples = [await sample('baseline after GC')];
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const name of [
      'Bathrooms',
      'Parking',
      'Vibes',
      'Tourism',
      'Pop-ups',
      'Events',
      'All places',
    ]) {
      await page
        .getByRole('navigation', { name: 'Categories' })
        .getByRole('button', { name, exact: true })
        .click();
      await expect(page.locator('.nearby-count')).toHaveText(/^\d+\+? nearby$/);
    }
    samples.push(await sample(`after ${(cycle + 1) * 7} category changes`));
  }
  await client.send('HeapProfiler.collectGarbage');
  samples.push(await sample('after 35 changes and GC'));
  for (const sample of samples) {
    expect(sample.canvasCount).toBe(1);
    expect(sample.iconWidgets).toBeLessThanOrEqual(24);
    expect(sample.placeRows).toBeLessThanOrEqual(4);
  }
  await writeFile(
    `${artifacts}/browser-resources.json`,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        viewport: page.viewportSize(),
        build: 'Vite production preview, desktop Chrome',
        units:
          'Heap values are bytes, TaskDuration is cumulative seconds. JS heap excludes Chromium/GPU/native memory.',
        samples,
      },
      null,
      2,
    ),
  );
});

test('export the launcher icon in common sizes', async ({ page }) => {
  await mkdir(`${artifacts}/icons`, { recursive: true });
  // The app defaults to Korean; these checks use English labels.
  await page.addInitScript(() => localStorage.setItem('languageChoice', 'en'));
  await page.goto('/');
  for (const size of [48, 64, 128, 192, 256, 512, 1024]) {
    const data = await page.evaluate(async (size) => {
      const image = new Image();
      image.src = new URL('./brand/neu-joh.svg', document.baseURI).href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, size);
    await writeFile(
      `${artifacts}/icons/neu-joh-${size}.png`,
      Buffer.from(data, 'base64'),
    );
  }
  await copyFile('public/brand/neu-joh.svg', `${artifacts}/icons/neu-joh.svg`);
});
