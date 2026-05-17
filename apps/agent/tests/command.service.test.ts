import { Test } from '@nestjs/testing';
import { CommandService } from '../src/command/command.service';
import { ClipboardService } from '../src/clipboard/clipboard.service';
import { AiRouterService } from '../src/ai/ai-router.service';
import { AppLaunchService } from '../src/app-launch/app-launch.service';

describe('CommandService', () => {
  let commandService: CommandService;
  let clipboardService: ClipboardService;
  let mockAiRouter: { call: jest.Mock };
  let mockAppLaunch: { launch: jest.Mock; openUrl: jest.Mock };

  beforeEach(async () => {
    mockAiRouter = { call: jest.fn().mockResolvedValue('AI result text') };
    mockAppLaunch = {
      launch: jest.fn().mockResolvedValue(undefined),
      openUrl: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService, useValue: mockAiRouter },
        { provide: AppLaunchService, useValue: mockAppLaunch },
      ],
    }).compile();

    commandService = moduleRef.get(CommandService);
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

  it('returns success: false for unimplemented KEYSTROKE', async () => {
    const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['cmd', 'c'] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not yet implemented/i);
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
});
