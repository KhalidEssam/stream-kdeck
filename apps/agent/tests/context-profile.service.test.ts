import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextProfileService } from '../src/context-profile/context-profile.service';

describe('ContextProfileService (CRUD)', () => {
  let service: ContextProfileService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    service = new ContextProfileService(null as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.USER_DATA_PATH;
  });

  it('returns null for unknown process', () => {
    expect(service.getProfile('Unknown.exe')).toBeNull();
  });

  it('returns true for isCurated Discord', () => {
    expect(service.isCurated('Discord.exe')).toBe(true);
  });

  it('returns false for isCurated unknown app', () => {
    expect(service.isCurated('MyApp.exe')).toBe(false);
  });

  it('addShortcut creates profile and persists', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute',
      keys: ['Ctrl', 'Shift', 'M'],
      description: 'Toggle mute',
    });
    const profile = service.getProfile('Discord.exe');
    expect(profile).not.toBeNull();
    expect(profile!.shortcuts).toHaveLength(1);
    expect(profile!.shortcuts[0].label).toBe('Mute');
    expect(profile!.shortcuts[0].id).toBeTruthy();
    expect(profile!.source).toBe('user');

    // Verify persisted to disk
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'context-profiles.json'), 'utf-8'));
    expect(raw.profiles['Discord.exe']).toBeDefined();
  });

  it('removeShortcut deletes entry by id', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: '',
    });
    const id = service.getProfile('Discord.exe')!.shortcuts[0].id;
    service.removeShortcut('Discord.exe', id);
    expect(service.getProfile('Discord.exe')!.shortcuts).toHaveLength(0);
  });

  it('getAllProfiles returns summaries with shortcuts', () => {
    service.addShortcut('Discord.exe', 'Discord', 'discord', {
      label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: '',
    });
    const summaries = service.getAllProfiles();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].processName).toBe('Discord.exe');
    expect(summaries[0].shortcutCount).toBe(1);
    expect(summaries[0].shortcuts).toHaveLength(1);
    expect(summaries[0].shortcuts[0].label).toBe('Mute');
  });
});

describe('ContextProfileService (LLM generation)', () => {
  let service: ContextProfileService;
  let tmpDir: string;
  let mockAiRouter: { call: jest.Mock };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-llm-test-'));
    process.env.USER_DATA_PATH = tmpDir;
    mockAiRouter = { call: jest.fn() };
    service = new ContextProfileService(mockAiRouter as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.USER_DATA_PATH;
  });

  it('generateAndCache stores llm profile on success', async () => {
    mockAiRouter.call.mockResolvedValue(
      JSON.stringify([{ label: 'Mute', keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle mute' }]),
    );
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    const profile = service.getProfile('Discord.exe');
    expect(profile?.source).toBe('llm');
    expect(profile?.shortcuts).toHaveLength(1);
    expect(profile?.shortcuts[0].id).toBeTruthy();
  });

  it('generateAndCache stores llm-failed on invalid JSON', async () => {
    mockAiRouter.call.mockResolvedValue('not json');
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm-failed');
  });

  it('generateAndCache stores llm-failed on empty array', async () => {
    mockAiRouter.call.mockResolvedValue('[]');
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm-failed');
  });

  it('generateAndCache strips markdown fences from LLM response', async () => {
    mockAiRouter.call.mockResolvedValue(
      '```json\n[{"label":"Mute","keys":["Ctrl","Shift","M"],"description":"x"}]\n```',
    );
    await service.generateAndCache('Discord.exe', 'Discord', 'discord', 'win32');
    expect(service.getProfile('Discord.exe')?.source).toBe('llm');
  });
});
