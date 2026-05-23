import { ClipboardProvider } from './clipboard.provider';

const STUB_REQUEST = { providerId: 'clipboard', toolId: 't1', packId: 'p1' };

function makeClipboardService(text: string) {
  return { read: jest.fn().mockResolvedValue(text), write: jest.fn() };
}

describe('ClipboardProvider', () => {
  it('id is "clipboard"', () => {
    const p = new ClipboardProvider(makeClipboardService('') as never);
    expect(p.id).toBe('clipboard');
  });

  it('probe returns available:true when clipboard has text', async () => {
    const p = new ClipboardProvider(makeClipboardService('hello') as never);
    const probe = await p.probe(STUB_REQUEST);
    expect(probe.available).toBe(true);
  });

  it('probe returns available:false when clipboard is empty', async () => {
    const p = new ClipboardProvider(makeClipboardService('') as never);
    const probe = await p.probe(STUB_REQUEST);
    expect(probe.available).toBe(false);
    expect(probe.unavailableReason).toBe('clipboard is empty');
  });

  it('read returns content and provenance', async () => {
    const p = new ClipboardProvider(makeClipboardService('some text') as never);
    const payload = await p.read(STUB_REQUEST);
    expect(payload.content).toBe('some text');
    expect(payload.providerId).toBe('clipboard');
    expect(payload.provenance).toMatch(/clipboard read at/);
  });

  it('read truncates content at MAX_BYTES', async () => {
    const big = 'x'.repeat(60_000);
    const p = new ClipboardProvider(makeClipboardService(big) as never);
    const payload = await p.read(STUB_REQUEST);
    expect(payload.content.length).toBeLessThanOrEqual(50_001);
    expect(payload.byteSize).toBeLessThanOrEqual(50_001);
  });

  it('preview includes sampleText and truncated flag', async () => {
    const big = 'a'.repeat(60_000);
    const p = new ClipboardProvider(makeClipboardService(big) as never);
    const preview = await p.preview(STUB_REQUEST);
    expect(preview.truncated).toBe(true);
    expect(preview.sampleText?.length).toBeLessThanOrEqual(100);
  });
});
