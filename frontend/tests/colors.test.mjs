import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const palette = JSON.parse(
  readFileSync(
    new URL('../public/icons/palette.json', import.meta.url),
    'utf8',
  ),
);
function luminance(hex) {
  const [r, g, b] = hex.match(/[a-f0-9]{2}/gi).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
test('each category retains a distinct, readable icon color against its actual SVG backing', () => {
  assert.equal(new Set(Object.values(palette)).size, 7);
  for (const [category, color] of Object.entries(palette)) {
    const svg = readFileSync(
      new URL('../public/icons/' + category + '.svg', import.meta.url),
      'utf8',
    );
    const backing = svg.match(/<rect[^>]+fill="(#[a-f0-9]+)"/i)[1];
    assert.ok(svg.includes(`stroke="${color}"`), category);
    const contrast = (luminance(color) + 0.05) / (luminance(backing) + 0.05);
    assert.ok(contrast >= 4.5, `${category}: ${contrast}`);
  }
});
