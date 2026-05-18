import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { networkInterfaces, hostname } from 'os';

@Injectable()
export class DeviceFingerprintService {
  getFingerprint(): string {
    const mac = this.firstMacAddress();
    return createHash('sha256').update(`${mac}::${hostname()}`).digest('hex');
  }

  getDeviceName(): string {
    return hostname();
  }

  private firstMacAddress(): string {
    const ifaces = networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (!entry.internal && entry.mac !== '00:00:00:00:00:00') {
          return entry.mac;
        }
      }
    }
    return 'no-mac';
  }
}
