import { Test } from '@nestjs/testing';
import { CommandService } from '../src/command/command.service';
import { ClipboardService } from '../src/clipboard/clipboard.service';
import { AiRouterService } from '../src/ai/ai-router.service';
import { AppLaunchService } from '../src/app-launch/app-launch.service';
import { KeystrokeService } from '../src/keystroke/keystroke.service';
import { LicenseService } from '../src/license/license.service';
import { PackRegistryService } from '../src/packs/pack-registry.service';
import { shell } from 'electron';

describe('CommandService', () => {
  let commandService: CommandService;
  let clipboardService: ClipboardService;
  let mockAiRouter: { call: jest.Mock };
  let mockAppLaunch: { launch: jest.Mock; openUrl: jest.Mock };
  let mockKeystroke: { execute: jest.Mock };
  let mockLicenseService: { creditsRemaining: jest.Mock; decrementCredit: jest.Mock };
  let mockPackRegistry: { getById: jest.Mock };

  beforeEach(async () => {
    mockAiRouter = { call: jest.fn().mockResolvedValue('AI result text') };
    mockAppLaunch = {
      launch: jest.fn().mockResolvedValue(undefined),
      openUrl: jest.fn().mockResolvedValue(undefined),
    };
    mockKeystroke = { execute: jest.fn().mockResolvedValue(undefined) };
    mockLicenseService = {
      creditsRemaining: jest.fn().mockReturnValue(10),
      decrementCredit: jest.fn(),
    };
    mockPackRegistry = { getById: jest.fn().mockReturnValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService,     useValue: mockAiRouter },
        { provide: AppLaunchService,    useValue: mockAppLaunch },
        { provide: KeystrokeService,    useValue: mockKeystroke },
        { provide: LicenseService,      useValue: mockLicenseService },
        { provide: PackRegistryService, useValue: mockPackRegistry },
      ],
    }).compile();

    commandService   = moduleRef.get(CommandService);
    clipboardService = moduleRef.get(ClipboardService);
  });

  it('executes CLIPBOARD_WRITE and updates the clipboard', async () => {
    const result = await commandService.execute({
      kind: 'CLIPBOARD_WRITE',
      text: 'hello world',
    });
    expect(result.success).toBe(true);
    expect(await clipboardService.read()).toBe('hello world');
  });

  it('executes AI_CLIPBOARD in clipboard mode — writes AI result to clipboard', async () => {
    await clipboardService.write('original text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Summarize this',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(true);
    expect(mockAiRouter.call).toHaveBeenCalledWith('Summarize this', 'original text');
    expect(await clipboardService.read()).toBe('AI result text');
  });

  it('executes AI_CLIPBOARD in autopaste mode — writes result to clipboard', async () => {
    await clipboardService.write('some text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix grammar',
      outputMode: 'autopaste',
    });
    expect(result.success).toBe(true);
    expect(await clipboardService.read()).toBe('AI result text');
  });

  it('executes AI_CLIPBOARD in viewer mode — returns output without touching clipboard', async () => {
    await clipboardService.write('my text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Explain this',
      outputMode: 'viewer',
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('AI result text');
    expect(await clipboardService.read()).toBe('my text');
  });

  it('executes KEYSTROKE — delegates to KeystrokeService', async () => {
    const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['ctrl', 'c'] });
    expect(result.success).toBe(true);
    expect(mockKeystroke.execute).toHaveBeenCalledWith(['ctrl', 'c']);
  });

  it('returns error when KeystrokeService throws (unknown key)', async () => {
    mockKeystroke.execute.mockRejectedValueOnce(new Error('Unknown key: "xyz"'));
    const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['ctrl', 'xyz'] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown key/);
  });

  it('executes APP_LAUNCH — calls appLaunch.launch with appId', async () => {
    const result = await commandService.execute({ kind: 'APP_LAUNCH', appId: 'spotify' });
    expect(result.success).toBe(true);
    expect(mockAppLaunch.launch).toHaveBeenCalledWith('spotify');
  });

  it('executes URL_OPEN — calls appLaunch.openUrl with url', async () => {
    const result = await commandService.execute({ kind: 'URL_OPEN', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(mockAppLaunch.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('returns error when APP_LAUNCH throws', async () => {
    mockAppLaunch.launch.mockRejectedValueOnce(new Error('Unknown app: badapp'));
    const result = await commandService.execute({ kind: 'APP_LAUNCH', appId: 'badapp' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown app/);
  });

  it('executes EXEC action via shell.openPath', async () => {
    const result = await commandService.execute({ kind: 'EXEC', exePath: 'C:\\Games\\Game.exe' });
    expect(result.success).toBe(true);
    expect(shell.openPath).toHaveBeenCalledWith('C:\\Games\\Game.exe');
  });

  it('returns failure when shell.openPath returns error string for EXEC', async () => {
    (shell.openPath as jest.Mock).mockResolvedValue('No such file');
    const result = await commandService.execute({ kind: 'EXEC', exePath: 'C:\\Bad\\game.exe' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to launch/);
  });

  it('returns quotaExceeded when AI_CLIPBOARD is called with 0 credits', async () => {
    mockLicenseService.creditsRemaining.mockReturnValue(0);
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Summarize this',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(false);
    expect(result.quotaExceeded).toBe(true);
    expect(mockAiRouter.call).not.toHaveBeenCalled();
  });

  it('calls AI when credits are available (1+)', async () => {
    mockLicenseService.creditsRemaining.mockReturnValue(1);
    await clipboardService.write('some text');
    const result = await commandService.execute({
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix grammar',
      outputMode: 'clipboard',
    });
    expect(result.success).toBe(true);
    expect(mockAiRouter.call).toHaveBeenCalled();
  });

  describe('toolId resolution', () => {
    async function buildWithRegistry(tool: object | undefined) {
      mockPackRegistry = { getById: jest.fn().mockReturnValue(tool) };
      const moduleRef = await Test.createTestingModule({
        providers: [
          CommandService,
          ClipboardService,
          { provide: AiRouterService,     useValue: mockAiRouter },
          { provide: AppLaunchService,    useValue: mockAppLaunch },
          { provide: KeystrokeService,    useValue: mockKeystroke },
          { provide: LicenseService,      useValue: mockLicenseService },
          { provide: PackRegistryService, useValue: mockPackRegistry },
        ],
      }).compile();
      clipboardService = moduleRef.get(ClipboardService);
      return moduleRef.get(CommandService);
    }

    it('resolves prompt and outputMode from registry when toolId is present', async () => {
      const registryTool = { prompt: 'Registry prompt', outputMode: 'viewer' };
      const svc = await buildWithRegistry(registryTool);
      await clipboardService.write('some text');
      const result = await svc.execute({
        kind: 'AI_CLIPBOARD',
        prompt: '',
        outputMode: 'clipboard',
        toolId: 'tool-uuid-1',
      });
      expect(result.success).toBe(true);
      expect(mockAiRouter.call).toHaveBeenCalledWith('Registry prompt', 'some text');
      expect(result.output).toBe('AI result text');
    });

    it('falls back to inline prompt when toolId is absent', async () => {
      const svc = await buildWithRegistry(undefined);
      await clipboardService.write('some text');
      await svc.execute({
        kind: 'AI_CLIPBOARD',
        prompt: 'Inline prompt',
        outputMode: 'clipboard',
      });
      expect(mockAiRouter.call).toHaveBeenCalledWith('Inline prompt', 'some text');
    });
  });
});
