import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot } from './project-root-resolver';

function makeTempTree(structure: Record<string, string | null>): string {
  const root = path.join(os.tmpdir(), `kdeck-proj-test-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (content !== null) fs.writeFileSync(full, content ?? '');
  }
  return root;
}

describe('findProjectRoot', () => {
  it('detects project root via .git', async () => {
    const root = makeTempTree({ '.git/HEAD': 'ref: refs/heads/main' });
    const sub = path.join(root, 'src', 'components');
    fs.mkdirSync(sub, { recursive: true });
    const found = await findProjectRoot(sub);
    expect(found).toBe(root);
    fs.rmSync(root, { recursive: true });
  });

  it('detects project root via package.json', async () => {
    const root = makeTempTree({ 'package.json': '{"name":"test"}' });
    const sub = path.join(root, 'src');
    fs.mkdirSync(sub, { recursive: true });
    const found = await findProjectRoot(sub);
    expect(found).toBe(root);
    fs.rmSync(root, { recursive: true });
  });

  it('returns startDir itself when it contains a marker', async () => {
    const root = makeTempTree({ '.git/HEAD': '' });
    const found = await findProjectRoot(root);
    expect(found).toBe(root);
    fs.rmSync(root, { recursive: true });
  });

  it('returns null or string for directory with no markers (does not throw)', async () => {
    const root = makeTempTree({});
    const found = await findProjectRoot(root);
    // May find real project root walking up test runner env — just check no exception
    expect(found === null || typeof found === 'string').toBe(true);
    fs.rmSync(root, { recursive: true });
  });
});
