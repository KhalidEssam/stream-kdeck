import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectWorkspaceProvider } from './project-workspace.provider';

function makeShellRunner(cwd: string) {
  return { getActiveCwd: jest.fn().mockReturnValue(cwd) };
}

function makeTempProject(files: Record<string, string>): string {
  const root = path.join(os.tmpdir(), `kdeck-ws-test-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const STUB_REQUEST = { providerId: 'project_files', toolId: 't1', packId: 'p1' };

describe('ProjectWorkspaceProvider', () => {
  it('id is "project_files"', () => {
    const p = new ProjectWorkspaceProvider(makeShellRunner('/') as never);
    expect(p.id).toBe('project_files');
  });

  it('probe shape is always a boolean', async () => {
    const p = new ProjectWorkspaceProvider(makeShellRunner(os.tmpdir()) as never);
    const probe = await p.probe(STUB_REQUEST);
    expect(typeof probe.available).toBe('boolean');
  });

  it('read returns README content when present', async () => {
    const root = makeTempProject({
      '.git/HEAD': '',
      'README.md': '# My Project\n\nThis is a test project.',
      'package.json': JSON.stringify({ name: 'my-project', scripts: { start: 'node index.js' } }),
    });
    const sub = path.join(root, 'src');
    fs.mkdirSync(sub);
    const p = new ProjectWorkspaceProvider(makeShellRunner(sub) as never);
    const payload = await p.read(STUB_REQUEST);
    expect(payload.content).toContain('My Project');
    expect(payload.content).toContain('my-project');
    expect(payload.providerId).toBe('project_files');
    fs.rmSync(root, { recursive: true });
  });

  it('read works even without README', async () => {
    const root = makeTempProject({
      '.git/HEAD': '',
      'package.json': JSON.stringify({ name: 'headless-project' }),
    });
    const p = new ProjectWorkspaceProvider(makeShellRunner(root) as never);
    const payload = await p.read(STUB_REQUEST);
    expect(payload.content).toContain('headless-project');
    fs.rmSync(root, { recursive: true });
  });
});
