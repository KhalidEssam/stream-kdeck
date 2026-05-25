import { CommandService } from './command.service';
import { ContextAssemblerService } from '../context/context-assembler.service';
import { UserContextCanceledError, UserContextRequestService } from '../context/user-context-request.service';

const mockPackTool = (overrides = {}) => ({
  id: 'tool-1',
  packId: 'pack-gamer',
  label: 'Explain Mechanic',
  kind: 'ai',
  prompt: 'Explain this mechanic.',
  outputMode: 'viewer',
  icon: 'ai',
  order: 1,
  phase: 1,
  contextRequirements: [
    { provider: 'user_input', required: true, captureMode: 'speech_or_text', reason: 'What to explain' },
    { provider: 'clipboard', required: false, reason: 'Game text for context', maxBytes: 10000 },
  ],
  ...overrides,
});

function makeService(overrides: {
  captureResult?: Awaited<ReturnType<UserContextRequestService['capture']>>;
  captureError?: Error;
  assembleResult?: string;
  credits?: number;
} = {}) {
  const clipboard = {
    read: jest.fn().mockResolvedValue('clipboard text'),
    write: jest.fn().mockResolvedValue(undefined),
  };
  const aiRouter = { call: jest.fn().mockResolvedValue('AI answer') };
  const appLaunch = { launch: jest.fn(), openUrl: jest.fn() };
  const keystroke = { execute: jest.fn() };
  const licenseService = {
    creditsRemaining: jest.fn().mockReturnValue(overrides.credits ?? 10),
    decrementCredit: jest.fn(),
  };
  const packRegistry = {
    getById: jest.fn().mockReturnValue(mockPackTool()),
    getPacks: jest.fn().mockReturnValue([{ id: 'pack-gamer', slug: 'gamer' }]),
  };
  const integrationRouter = { dispatch: jest.fn() };
  const pluginCatalog = { getPlugins: jest.fn().mockReturnValue([]) };
  const cloudClient = { execute: jest.fn() };
  const shellRunner = { run: jest.fn() };
  const runHistory = { push: jest.fn() };
  const assembler = {
    assemble: jest.fn().mockResolvedValue(overrides.assembleResult ?? '### Clipboard\ncontext'),
  } as unknown as ContextAssemblerService;
  const userContextRequest = {
    capture: jest.fn().mockImplementation(() => {
      if (overrides.captureError) return Promise.reject(overrides.captureError);
      return Promise.resolve(overrides.captureResult ?? {
        text: 'What does Killjoy Alarmbot do?',
        modality: 'text',
      });
    }),
  } as unknown as UserContextRequestService;

  const service = new CommandService(
    clipboard as any,
    aiRouter as any,
    appLaunch as any,
    keystroke as any,
    licenseService as any,
    packRegistry as any,
    integrationRouter as any,
    pluginCatalog as any,
    cloudClient as any,
    shellRunner as any,
    runHistory as any,
    assembler,
    userContextRequest,
  );

  return {
    service,
    aiRouter,
    assembler,
    licenseService,
    userContextRequest,
  };
}

describe('CommandService - AI_CLIPBOARD + user_input', () => {
  const client = {} as any;
  const action = {
    kind: 'AI_CLIPBOARD' as const,
    toolId: 'tool-1',
    prompt: '',
    outputMode: 'viewer' as const,
  };

  it('captures user intent before calling the assembler', async () => {
    const { service, userContextRequest, assembler } = makeService();

    await service.execute(action, client);

    expect(userContextRequest.capture).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ toolId: 'tool-1', required: true }),
    );
    expect(assembler.assemble).toHaveBeenCalled();
    const captureOrder = (userContextRequest.capture as jest.Mock).mock.invocationCallOrder[0];
    const assembleOrder = (assembler.assemble as jest.Mock).mock.invocationCallOrder[0];
    expect(captureOrder).toBeLessThan(assembleOrder);
  });

  it('filters user_input out of assembler requirements', async () => {
    const { service, assembler } = makeService();

    await service.execute(action, client);

    const [requirements] = (assembler.assemble as jest.Mock).mock.calls[0] as [any[], ...any[]];
    expect(requirements.every((req: any) => req.provider !== 'user_input')).toBe(true);
  });

  it('passes user intent and pack slug to the assembler', async () => {
    const { service, assembler } = makeService();

    await service.execute(action, client);

    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.any(Array),
      client,
      'pack-gamer',
      'tool-1',
      'What does Killjoy Alarmbot do?',
      'gamer',
    );
  });

  it('returns canceled and skips AI call and credit decrement when user cancels', async () => {
    const { service, aiRouter, licenseService } = makeService({
      captureError: new UserContextCanceledError(),
    });

    const result = await service.execute(action, client);

    expect(result).toMatchObject({ success: false, error: 'Canceled' });
    expect(aiRouter.call).not.toHaveBeenCalled();
    expect(licenseService.decrementCredit).not.toHaveBeenCalled();
  });
});
