import * as os from 'os';
import { ShellRunnerService } from './shell-runner.service';

describe('ShellRunnerService', () => {
  let service: ShellRunnerService;

  beforeEach(() => {
    service = new ShellRunnerService();
  });

  it('defaults activeCwd to os.homedir()', () => {
    expect(service.getActiveCwd()).toBe(os.homedir());
  });

  it('setActiveCwd updates the stored cwd', () => {
    service.setActiveCwd('/tmp/myproject');
    expect(service.getActiveCwd()).toBe('/tmp/myproject');
  });

  it('runs a command and returns stdout', async () => {
    const result = await service.run({ command: process.platform === 'win32' ? 'echo hello' : 'echo hello' });
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns success:false on unknown command', async () => {
    const result = await service.run({ command: 'this_command_does_not_exist_xyz' });
    expect(result.success).toBe(false);
    expect(result.stderr).toBeDefined();
  });

  it('uses explicit cwd when provided', async () => {
    const tmpDir = os.tmpdir();
    const result = await service.run({
      command: process.platform === 'win32' ? 'cd' : 'pwd',
      cwd: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.cwd).toBe(tmpDir);
    // Verify exec actually ran in the given cwd, not just that we echoed the field back
    expect(result.stdout.trim().toLowerCase()).toContain(tmpDir.toLowerCase());
  });

  it('includes durationMs in result', async () => {
    const result = await service.run({ command: process.platform === 'win32' ? 'echo hi' : 'echo hi' });
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
