import { Test } from '@nestjs/testing';
import { CommandService } from '../src/command/command.service';
import { ClipboardService } from '../src/clipboard/clipboard.service';
import { AiRouterService } from '../src/ai/ai-router.service';

describe('CommandService', () => {
  let commandService: CommandService;
  let clipboardService: ClipboardService;
  let mockAiRouter: { call: jest.Mock };

  beforeEach(async () => {
    mockAiRouter = { call: jest.fn().mockResolvedValue('AI result text') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommandService,
        ClipboardService,
        { provide: AiRouterService, useValue: mockAiRouter },
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

  it('returns success: false for unimplemented KEYSTROKE (deferred to Week 3-4)', async () => {
    const result = await commandService.execute({ kind: 'KEYSTROKE', keys: ['cmd', 'c'] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not yet implemented/i);
  });

  it('returns success: false for unimplemented APP_LAUNCH (deferred to Week 3-4)', async () => {
    const result = await commandService.execute({ kind: 'APP_LAUNCH', bundleId: 'com.apple.xcode' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not yet implemented/i);
  });
});
