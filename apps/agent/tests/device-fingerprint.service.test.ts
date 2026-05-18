import { DeviceFingerprintService } from '../src/license/device-fingerprint.service';
import * as os from 'os';

describe('DeviceFingerprintService', () => {
  let service: DeviceFingerprintService;

  beforeEach(() => {
    service = new DeviceFingerprintService();
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const fp = service.getFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same fingerprint on repeated calls', () => {
    expect(service.getFingerprint()).toBe(service.getFingerprint());
  });

  it('returns the OS hostname as device name', () => {
    expect(service.getDeviceName()).toBe(os.hostname());
  });
});
