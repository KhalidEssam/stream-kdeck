import { GitContextProvider } from './git-context.provider';

const STUB_REQUEST = { providerId: 'git', toolId: 't1', packId: 'p1' };

function makeShellRunner(cwd: string, runResult: { success: boolean; stdout: string }) {
  return {
    getActiveCwd: jest.fn().mockReturnValue(cwd),
    run: jest.fn().mockResolvedValue({ ...runResult, stderr: undefined, durationMs: 10, cwd }),
  };
}

// Active window stub — returns null so resolveCwd() falls back to shellRunner
const NULL_ACTIVE_WINDOW = { current: null, currentTitle: null } as never;

describe('GitContextProvider', () => {
  it('id is "git"', () => {
    const p = new GitContextProvider(makeShellRunner('/', { success: true, stdout: '' }) as never, NULL_ACTIVE_WINDOW);
    expect(p.id).toBe('git');
  });

  it('probe returns available:false when git status fails', async () => {
    const runner = makeShellRunner('/not-a-repo', { success: false, stdout: '' });
    const p = new GitContextProvider(runner as never, NULL_ACTIVE_WINDOW);
    const probe = await p.probe(STUB_REQUEST);
    expect(probe.available).toBe(false);
    expect(probe.unavailableReason).toBeDefined();
  });

  it('probe returns available:true when git status succeeds', async () => {
    const runner = makeShellRunner('/repo', { success: true, stdout: 'On branch main' });
    const p = new GitContextProvider(runner as never, NULL_ACTIVE_WINDOW);
    const probe = await p.probe(STUB_REQUEST);
    expect(probe.available).toBe(true);
  });

  it('read combines git status and log output', async () => {
    const runner = {
      getActiveCwd: jest.fn().mockReturnValue('/repo'),
      run: jest.fn()
        .mockResolvedValueOnce({ success: true, stdout: 'On branch main\nnothing to commit', cwd: '/repo', durationMs: 5 })
        .mockResolvedValueOnce({ success: true, stdout: 'abc1234 feat: add thing', cwd: '/repo', durationMs: 5 }),
    };
    const p = new GitContextProvider(runner as never, NULL_ACTIVE_WINDOW);
    const payload = await p.read(STUB_REQUEST);
    expect(payload.content).toContain('On branch main');
    expect(payload.content).toContain('abc1234');
    expect(payload.providerId).toBe('git');
  });
});
