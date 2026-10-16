import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual handler with an injected Supabase transport. Offline tests use
// mocks; the localhost integration runner supplies real Auth and database clients.
export function loadEdgeHandler(name, createClient, env = {}, globals = {}) {
  let handler;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(
    /^import .*(?:createClient|webpush).*;\r?\n/gm,
    '',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = vm.createContext({
    createClient,
    Response,
    Request,
    crypto: globalThis.crypto,
    URL,
    TextEncoder,
    ...globals,
    Deno: { env: { get: (key) => env[key] ?? key }, serve: (callback) => (handler = callback) },
  });
  vm.runInContext(code, context);
  return { handler, context };
}
