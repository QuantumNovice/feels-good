import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022 },
}).outputText;
const { messages, translate } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
test('all interface keys exist in English, Korean and Japanese', () => {
  const keys = Object.keys(messages.en).sort();
  for (const lang of ['en', 'ko', 'ja']) {
    assert.deepEqual(Object.keys(messages[lang]).sort(), keys);
    for (const key of keys)
      assert.ok(translate(lang, key).trim(), `${lang}:${key}`);
  }
});
test('every requested UI translation key is defined', () => {
  const sourceDir = new URL('../src/', import.meta.url);
  const paths = [
    new URL('App.vue', sourceDir),
    ...readdirSync(new URL('components/', sourceDir))
      .filter((p) => p.endsWith('.vue'))
      .map((p) => new URL('components/' + p, sourceDir)),
  ];
  const ui = paths.map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const match of ui.matchAll(/\bt\(["']([^"']+)["']\)/g))
    assert.ok(match[1] in messages.en, match[1]);
});
