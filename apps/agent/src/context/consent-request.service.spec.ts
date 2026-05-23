import { ConsentRequestService } from './consent-request.service';

describe('ConsentRequestService', () => {
  let service: ConsentRequestService;

  beforeEach(() => {
    service = new ConsentRequestService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves granted=true with scope when handleResponse called before timeout', async () => {
    const client = { send: jest.fn() } as any;
    const promise = service.request(client, {
      packId: 'pack-1',
      providerId: 'clipboard',
      providerLabel: 'Clipboard',
      reason: 'test reason',
    });
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    service.handleResponse(msg.requestId, true, 'once');
    const result = await promise;
    expect(result).toEqual({ granted: true, scope: 'once' });
  });

  it('resolves granted=false after 60-second timeout', async () => {
    const client = { send: jest.fn() } as any;
    const promise = service.request(client, {
      packId: 'pack-1',
      providerId: 'clipboard',
      providerLabel: 'Clipboard',
      reason: 'test reason',
    });
    jest.advanceTimersByTime(60_000);
    const result = await promise;
    expect(result).toEqual({ granted: false });
  });

  it('handleResponse for unknown requestId is a no-op', () => {
    expect(() => service.handleResponse('unknown', true, 'once')).not.toThrow();
  });

  it('sends a CONTEXT_PERMISSION_REQUEST message to the client', async () => {
    const client = { send: jest.fn() } as any;
    service.request(client, {
      packId: 'pack-1',
      providerId: 'git',
      providerLabel: 'Git',
      reason: 'needs git history',
    });
    const msg = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
    expect(msg.type).toBe('CONTEXT_PERMISSION_REQUEST');
    expect(msg.packId).toBe('pack-1');
    expect(msg.providerId).toBe('git');
    expect(msg.scopeOptions).toEqual(['once', 'session', 'permanent']);
    service.handleResponse(msg.requestId, false);
  });
});
