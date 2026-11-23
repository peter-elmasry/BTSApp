import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const workspaceDir = path.resolve(root, '../..');
const runtime =
  process.env.CODEX_RUNTIME_ROOT ??
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
process.env.RUNTIME_NODE_MODULES ??= path.join(runtime, 'node/node_modules');
const skillParent = path.join(
  os.homedir(),
  '.codex/plugins/cache/openai-primary-runtime/presentations',
);
const versions = (await fs.readdir(skillParent)).sort();
const skill = path.join(skillParent, versions.at(-1), 'skills/presentations');
const { finalizePresentation } = await import(
  pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs'))
);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath: path.join(workspaceDir, 'tmp/gift-build/candidate.pptx'),
  finalPath: path.join(root, 'output/The-Gift-of-Being-Yourself.pptx'),
  pythonExecutable: path.join(runtime, 'python/python.exe'),
  integrityValidatorPath: path.join(
    skill,
    'container_tools/inspect_presentation_package_integrity.py',
  ),
  layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: [
    '--expected-slide-size-emu',
    '12192000,6858000',
    '--validate-heading-fit',
    '--require-native-table-slide',
    '12',
  ],
  explicitTotalSlideCount: 20,
  requiredNativeTableOwnerSlides: [12],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: 'design', families: ['Arial'] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, 'tmp/gift-build/validation.json'),
});
console.log(JSON.stringify(result, null, 2));
