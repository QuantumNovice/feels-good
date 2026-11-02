import { readFileSync } from 'node:fs';
import ts from 'typescript';
const cache = new Map();
export function compiledModule(relative) {
  const path = new URL(relative, import.meta.url);
  if (cache.has(path.href)) return cache.get(path.href);
  let code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replace(/from ['"](\.[^'"]+)['"]/g, (_, name) => {
    const dependency = new URL(
      name.endsWith('.ts') ? name : name + '.ts',
      path,
    );
    return `from "${compiledModule(dependency.href)}"`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
