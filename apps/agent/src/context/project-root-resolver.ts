import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { isVsCodeProcessName, resolveVsCodeWorkspace } from '../active-window/vscode-workspace-resolver';

const ROOT_MARKERS = [
  '.git',
  'package.json',
  'pnpm-workspace.yaml',
  'Cargo.toml',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
];

export async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = startDir;
  const fsRoot = path.parse(current).root;

  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current || current === fsRoot) return null;
    current = parent;
  }
}

export interface ActiveProjectRootInput {
  activeCwd: string;
  activeApp?: string | null;
  activeWindowTitle?: string | null;
}

export async function resolveActiveProjectRoot(input: ActiveProjectRootInput): Promise<string | null> {
  const vscodeWorkspace = resolveVsCodeWorkspace(input.activeWindowTitle ?? null);
  const vscodeRoot = vscodeWorkspace ? await findProjectRoot(vscodeWorkspace) : null;
  const activeCwdRoot = await findProjectRoot(input.activeCwd);
  const activeCwdIsHome = pathsEqual(input.activeCwd, homedir());
  const activeAppIsVsCode = isVsCodeProcessName(input.activeApp ?? null);

  if ((activeAppIsVsCode || activeCwdIsHome) && vscodeRoot) {
    return vscodeRoot;
  }

  if (activeAppIsVsCode && activeCwdIsHome) {
    return null;
  }

  return activeCwdRoot ?? vscodeRoot;
}

function pathsEqual(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
