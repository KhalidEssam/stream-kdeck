import * as fs from 'fs';
import * as path from 'path';

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
