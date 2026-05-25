import { UserContextCanceledError, UserContextRequestService } from './user-context-request.service';

describe('UserContextRequestService', () => {
  let service: UserContextRequestService;

  beforeEach(() => {
    service = new UserContextRequestService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeClient() {
    return { send: jest.fn(), readyState: 1 } as any;
  }

  function baseParams(overrides: object = {}) {
    return {
      toolId: 'tool-1',
      packId: 'pack-1',
      title: 'Explain Mechanic',
      prompt: 'What mechanic do you want explained?',
      required: true,
      captureMode: 'text' as const,
      ...overrides,
    };
  }

  it('sends USER_CONTEXT_REQUEST to client on capture', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    expect(msg.type).toBe('USER_CONTEXT_REQUEST');
    expect(msg.toolId).toBe('tool-1');
    expect(msg.captureMode).toBe('text');
    service.handleResponse(msg.requestId, true);
    await expect(promise).rejects.toThrow(UserContextCanceledError);
  });

  it('resolves with text when handleResponse called with canceled=false and non-empty text', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, false, 'how do I use Killjoy?');
    const result = await promise;
    expect(result.text).toBe('how do I use Killjoy?');
    expect(result.modality).toBe('text');
  });

  it('rejects with UserContextCanceledError when canceled=true', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, true);
    await expect(promise).rejects.toThrow(UserContextCanceledError);
  });

  it('rejects when text is empty even if canceled=false', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, false, '   ');
    await expect(promise).rejects.toThrow(UserContextCanceledError);
  });

  it('rejects after timeout and sends USER_CONTEXT_CANCEL', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams({ timeoutMs: 30_000 }));
    jest.advanceTimersByTime(30_000);
    await expect(promise).rejects.toThrow(UserContextCanceledError);
    const calls = (client.send as jest.Mock).mock.calls.map((call: any[]) => JSON.parse(call[0]));
    const cancel = calls.find((msg: any) => msg.type === 'USER_CONTEXT_CANCEL');
    expect(cancel).toBeDefined();
  });

  it('cancels first request and sends USER_CONTEXT_CANCEL when second capture starts for same client and toolId', async () => {
    const client = makeClient();
    const first = service.capture(client, baseParams({ toolId: 'tool-x' }));
    const firstRequest = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);

    const second = service.capture(client, baseParams({ toolId: 'tool-x' }));

    await expect(first).rejects.toThrow(UserContextCanceledError);

    const allMsgs = (client.send as jest.Mock).mock.calls.map((call: any[]) => JSON.parse(call[0]));
    const cancelMsg = allMsgs.find(
      (msg: any) => msg.type === 'USER_CONTEXT_CANCEL' && msg.requestId === firstRequest.requestId,
    );
    expect(cancelMsg).toBeDefined();

    const secondRequest = allMsgs.filter((msg: any) => msg.type === 'USER_CONTEXT_REQUEST')[1];
    service.handleResponse(secondRequest.requestId, false, 'second answer');
    const result = await second;
    expect(result.text).toBe('second answer');
  });

  it('does not cancel matching tool requests from different clients', async () => {
    const firstClient = makeClient();
    const secondClient = makeClient();
    const first = service.capture(firstClient, baseParams({ toolId: 'tool-x' }));
    const second = service.capture(secondClient, baseParams({ toolId: 'tool-x' }));

    const firstRequest = JSON.parse((firstClient.send as jest.Mock).mock.calls[0][0]);
    const secondRequest = JSON.parse((secondClient.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(firstRequest.requestId, false, 'first answer');
    service.handleResponse(secondRequest.requestId, false, 'second answer');

    await expect(first).resolves.toMatchObject({ text: 'first answer' });
    await expect(second).resolves.toMatchObject({ text: 'second answer' });
  });

  it('handleResponse for unknown requestId is a no-op', () => {
    expect(() => service.handleResponse('unknown', false, 'text')).not.toThrow();
  });

  it('uses default 120-second timeout when timeoutMs is not provided', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    jest.advanceTimersByTime(119_999);
    let rejected = false;
    promise.catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(promise).rejects.toThrow(UserContextCanceledError);
  });

  it('cancelForClient rejects all pending requests for that client', async () => {
    const client = makeClient();
    const promise = service.capture(client, baseParams());
    service.cancelForClient(client);
    await expect(promise).rejects.toThrow(UserContextCanceledError);
  });
});
