import { RunHistoryService, RunRecord } from './run-history.service';

function makeRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'test-id',
    timestamp: new Date().toISOString(),
    action: { kind: 'CLIPBOARD_WRITE', text: 'hello' },
    success: true,
    durationMs: 10,
    ...overrides,
  };
}

describe('RunHistoryService', () => {
  let service: RunHistoryService;

  beforeEach(() => {
    service = new RunHistoryService();
  });

  it('returns empty array when no records exist', () => {
    expect(service.getAll()).toEqual([]);
  });

  it('push adds a record and getAll returns it newest first', () => {
    const r1 = makeRecord({ id: 'r1' });
    const r2 = makeRecord({ id: 'r2' });
    service.push(r1);
    service.push(r2);
    const all = service.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('r2');
    expect(all[1].id).toBe('r1');
  });

  it('caps history at 500 — pushing 501 records drops the oldest', () => {
    for (let i = 0; i < 501; i++) {
      service.push(makeRecord({ id: `r${i}` }));
    }
    const all = service.getAll();
    expect(all).toHaveLength(500);
    // oldest (r0) was dropped; newest (r500) is first
    expect(all[0].id).toBe('r500');
    expect(all[499].id).toBe('r1');
  });

  it('clear empties the history', () => {
    service.push(makeRecord({ id: 'r1' }));
    service.push(makeRecord({ id: 'r2' }));
    service.clear();
    expect(service.getAll()).toEqual([]);
  });

  it('getAll returns a copy — mutating the result does not affect internal state', () => {
    service.push(makeRecord({ id: 'r1' }));
    const snapshot = service.getAll();
    snapshot.push(makeRecord({ id: 'injected' }));
    expect(service.getAll()).toHaveLength(1);
  });
});
