import { Module } from '@nestjs/common';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { SecureStorageService } from './secure-storage.service';
import { LicenseService } from './license.service';
import { ActivationDialogService } from './activation-dialog.service';

@Module({
  providers: [
    DeviceFingerprintService,
    SecureStorageService,
    LicenseService,
    ActivationDialogService,
  ],
  exports: [LicenseService, ActivationDialogService, DeviceFingerprintService],
})
export class LicenseModule {}
