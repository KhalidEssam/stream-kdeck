import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ConsentStoreService } from './consent-store.service';

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `kdeck-consent-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ConsentStoreService', () => {
  let dir: string;
  let service: ConsentStoreService;

  beforeEach(() => {
    dir = makeTempDir();
    service = new ConsentStoreService(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with no grants', () => {
    expect(service.getAll()).toHaveLength(0);
    expect(service.isGranted('git-pack', 'project_files')).toBe(false);
  });

  it('grant() registers a scope', () => {
    service.grant('git-pack', 'project_files', 'session');
    expect(service.isGranted('git-pack', 'project_files')).toBe(true);
  });

  it('revoke() removes a grant', () => {
    service.grant('git-pack', 'project_files', 'session');
    service.revoke('git-pack', 'project_files');
    expect(service.isGranted('git-pack', 'project_files')).toBe(false);
  });

  it('clearSession() removes session and once grants but keeps permanent', () => {
    service.grant('p1', 'clipboard', 'once');
    service.grant('p2', 'active_window', 'session');
    service.grant('p3', 'project_files', 'permanent');
    service.clearSession();
    expect(service.isGranted('p1', 'clipboard')).toBe(false);
    expect(service.isGranted('p2', 'active_window')).toBe(false);
    expect(service.isGranted('p3', 'project_files')).toBe(true);
  });

  it('permanent grants survive a reload from disk', () => {
    service.grant('git-pack', 'project_files', 'permanent');
    const reloaded = new ConsentStoreService(dir);
    expect(reloaded.isGranted('git-pack', 'project_files')).toBe(true);
  });

  it('session grants are not persisted across reloads', () => {
    service.grant('git-pack', 'project_files', 'session');
    const reloaded = new ConsentStoreService(dir);
    expect(reloaded.isGranted('git-pack', 'project_files')).toBe(false);
  });
});
