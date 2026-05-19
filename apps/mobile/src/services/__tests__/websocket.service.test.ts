import WS from 'jest-websocket-mock';
import { WebSocketService } from '../websocket.service';
import { ConnectedMessage, ActionResultMessage, LicenseStatusMessage } from '../../types/schema';

describe('WebSocketService', () => {
  let server: WS;
  let service: WebSocketService;

  beforeEach(async () => {
    server = new WS('ws://localhost:3001');
    service = new WebSocketService('ws://localhost:3001');
    await server.connected;
  });

  afterEach(() => {
    service.disconnect();
    WS.clean();
  });

  it('emits "connected" status when server sends CONNECTED message', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));

    const msg: ConnectedMessage = { type: 'CONNECTED', agentVersion: '0.1.0', platform: 'darwin' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toContain('connected');
  });

  it('sends a valid BUTTON_TAP message when tap() is called', async () => {
    service.tap('btn-1', { kind: 'AI_CLIPBOARD', prompt: 'test', outputMode: 'clipboard' });
    const received = await server.nextMessage;
    const parsed = JSON.parse(received as string);
    expect(parsed.type).toBe('BUTTON_TAP');
    expect(parsed.buttonId).toBe('btn-1');
    expect(parsed.action.kind).toBe('AI_CLIPBOARD');
    expect(parsed.action.prompt).toBe('test');
  });

  it('calls onResult callback when server sends ACTION_RESULT', async () => {
    const results: ActionResultMessage[] = [];
    service.onResult((r) => results.push(r));

    const msg: ActionResultMessage = {
      type: 'ACTION_RESULT',
      buttonId: 'btn-1',
      success: true,
      output: 'summarized text',
    };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(results).toHaveLength(1);
    expect(results[0].output).toBe('summarized text');
    expect(results[0].buttonId).toBe('btn-1');
  });

  it('calls onLicenseStatus callback when server sends LICENSE_STATUS', async () => {
    const statuses: LicenseStatusMessage[] = [];
    const unsubscribe = service.onLicenseStatus((msg) => statuses.push(msg));

    const msg: LicenseStatusMessage = {
      type: 'LICENSE_STATUS',
      licensed: true,
      aiPro: false,
      creditsRemaining: 42,
      creditQuota: 100,
    };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toEqual([msg]);

    unsubscribe();
    server.send(JSON.stringify({ ...msg, creditsRemaining: 41 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).toEqual([msg]);
  });

  it('sends OPEN_ACTIVATION_DIALOG when openActivationDialog is called', async () => {
    service.openActivationDialog();
    await expect(server).toReceiveMessage(JSON.stringify({ type: 'OPEN_ACTIVATION_DIALOG' }));
  });

  it('sends GET_LICENSE_STATUS when requestLicenseStatus is called', async () => {
    service.requestLicenseStatus();
    await expect(server).toReceiveMessage(JSON.stringify({ type: 'GET_LICENSE_STATUS' }));
  });

  it('calls onAiQuotaExceeded callback when server sends AI_QUOTA_EXCEEDED', async () => {
    const cb = jest.fn();
    const unsubscribe = service.onAiQuotaExceeded(cb);

    const msg = { type: 'AI_QUOTA_EXCEEDED', reason: 'credits_exhausted' };
    server.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 50));
    expect(cb).toHaveBeenCalledWith(msg);

    unsubscribe();
    server.send(JSON.stringify(msg));
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('emits "disconnected" status when server closes', async () => {
    const statuses: string[] = [];
    service.onStatusChange((s) => statuses.push(s));

    server.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(statuses).toContain('disconnected');
  });
});
