import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { isVsCodeProcessName, resolveVsCodeWorkspace } from './vscode-workspace-resolver';

function makeTempProject(name: string): string {
  const root = path.join(os.tmpdir(), `kdeck-vscode-${name}-${Date.now()}`);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
  return root;
}

function writeStorage(storage: unknown): string {
  const filePath = path.join(os.tmpdir(), `kdeck-vscode-storage-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(storage), 'utf8');
  return filePath;
}

describe('resolveVsCodeWorkspace', () => {
  it('reads the modern windowsState.lastActiveWindow folder', () => {
    const project = makeTempProject('last-active');
    const storage = writeStorage({
      windowsState: {
        lastActiveWindow: { folder: pathToFileURL(project).href },
      },
    });

    expect(resolveVsCodeWorkspace(null, storage)).toBe(path.normalize(project));

    fs.rmSync(project, { recursive: true });
    fs.rmSync(storage);
  });

  it('prefers the workspace named in the VS Code title', () => {
    const one = makeTempProject('one');
    const two = makeTempProject('two');
    const storage = writeStorage({
      windowsState: {
        lastActiveWindow: { folder: pathToFileURL(one).href },
        openedWindows: [{ folder: pathToFileURL(two).href }],
      },
    });

    expect(resolveVsCodeWorkspace(`file.ts - ${path.basename(two)} - Visual Studio Code`, storage))
      .toBe(path.normalize(two));

    fs.rmSync(one, { recursive: true });
    fs.rmSync(two, { recursive: true });
    fs.rmSync(storage);
  });

  it('supports backupWorkspaces folderUri entries', () => {
    const project = makeTempProject('backup');
    const storage = writeStorage({
      backupWorkspaces: {
        folders: [{ folderUri: pathToFileURL(project).href }],
      },
    });

    expect(resolveVsCodeWorkspace(null, storage)).toBe(path.normalize(project));

    fs.rmSync(project, { recursive: true });
    fs.rmSync(storage);
  });
});

describe('isVsCodeProcessName', () => {
  it('matches common VS Code process names', () => {
    expect(isVsCodeProcessName('Code.exe')).toBe(true);
    expect(isVsCodeProcessName('code - insiders.exe')).toBe(true);
    expect(isVsCodeProcessName('explorer.exe')).toBe(false);
  });
});
