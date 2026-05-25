import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { SecureStorageService } from './secure-storage.service';

const REFRESH_TOKEN_KEY = 'refresh_token';
const CACHED_CLAIMS_KEY = 'cached_claims';
const LICENSE_KEY_KEY = 'license_key';

type SupabaseClientOptions = NonNullable<Parameters<typeof createClient>[2]>;
type SupabaseRealtimeTransport = NonNullable<SupabaseClientOptions['realtime']>['transport'];

export interface LicenseClaims {
  sub:               string;
  licensed:          boolean;
  ai_pro:            boolean;
  credits_remaining: number;
  credit_quota:      number;
}

const DEFAULT_CLAIMS: LicenseClaims = { sub: '', licensed: false, ai_pro: false, credits_remaining: 0, credit_quota: 0 };

export type LicenseActivationErrorCode =
  | 'INVALID_KEY'
  | 'REVOKED'
  | 'DEVICE_MISMATCH'
  | 'USER_NOT_FOUND'
  | 'SESSION_GENERATION_FAILED'
  | 'AGENT_NOT_CONFIGURED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class LicenseActivationError extends Error {
  constructor(
    readonly code: LicenseActivationErrorCode,
    readonly status?: number,
  ) {
    super(code);
  }
}

@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private claims: LicenseClaims = { ...DEFAULT_CLAIMS };
  private readonly supabase: SupabaseClient;
  private readonly claimsChangedCallbacks: Array<() => void> = [];
  private initialRefresh: Promise<void> | null = null;

  constructor(
    private readonly storage: SecureStorageService,
    private readonly fingerprint: DeviceFingerprintService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? '',
      {
        realtime: {
          transport: WebSocket as unknown as SupabaseRealtimeTransport,
        },
      },
    );
  }

  onApplicationBootstrap(): void {
    this.loadCachedClaims();
    console.log('[License] Boot cached claims:', this.getClaims());
    this.initialRefresh = this.refreshSession()
      .then(() => {
        console.log('[License] Refreshed claims:', this.getClaims());
      })
      .catch((error) => {
        console.warn('[License] Background refresh failed:', error instanceof Error ? error.message : String(error));
      });
  }

  onClaimsChanged(cb: () => void): void {
    this.claimsChangedCallbacks.push(cb);
  }

  async waitForInitialRefresh(): Promise<void> {
    await this.initialRefresh;
  }

  async refreshSession(): Promise<void> {
    const refreshToken = this.storage.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      await this.reactivateWithStoredLicenseKey();
      return;
    }

    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        await this.handleRefreshFailure(error?.message ?? 'Session refresh failed');
        return;
      }

      this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
      this.updateClaimsFromJwt(data.session.access_token);
      this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
      this.notifyClaimsChanged();
    } catch {
      // Keep cached claims when the license server is temporarily unavailable.
    }
  }

  async activateWithLicenseKey(licenseKey: string): Promise<void> {
    const hashedToken = await this.requestActivationToken(licenseKey);
    await this.activateWithHashedToken(hashedToken, licenseKey);
  }

  async activateWithHashedToken(hashedToken: string, licenseKey?: string): Promise<void> {
    const { data, error } = await this.supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'Session creation failed');
    }
    this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
    if (licenseKey) {
      this.storage.set(LICENSE_KEY_KEY, licenseKey.trim());
    }
    this.updateClaimsFromJwt(data.session.access_token);
    this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
    this.notifyClaimsChanged();
  }

  decrementCredit(): void {
    // The ai-proxy Edge Function handles the authoritative DB write.
    // This only updates the local in-memory counter so the mobile gets
    // real-time feedback without waiting for a token refresh.
    if (this.claims.credits_remaining > 0) {
      this.claims.credits_remaining = Math.max(0, this.claims.credits_remaining - 1);
      this.notifyClaimsChanged();
    }
  }

  async clearTokens(): Promise<void> {
    this.storage.delete(REFRESH_TOKEN_KEY);
    this.storage.delete(CACHED_CLAIMS_KEY);
    this.storage.delete(LICENSE_KEY_KEY);
    this.claims = { ...DEFAULT_CLAIMS };
    this.notifyClaimsChanged();
  }

  hasRefreshToken(): boolean {
    return !!this.storage.get(REFRESH_TOKEN_KEY) || !!this.storage.get(LICENSE_KEY_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    let { data } = await this.supabase.auth.getSession();
    if (!data.session) {
      await this.refreshSession();
      ({ data } = await this.supabase.auth.getSession());
    }
    return data.session?.access_token ?? null;
  }

  isLicensed(): boolean          { return this.claims.licensed; }
  isAiPro(): boolean             { return this.claims.ai_pro; }
  creditsRemaining(): number     { return this.claims.credits_remaining; }
  getClaims(): LicenseClaims     { return { ...this.claims }; }
  getUserId(): string | null     { return this.claims.sub.trim() || null; }

  private loadCachedClaims(): void {
    const cached = this.storage.get(CACHED_CLAIMS_KEY);
    if (!cached) return;
    try { this.claims = { ...DEFAULT_CLAIMS, ...JSON.parse(cached) }; } catch {}
  }

  private updateClaimsFromJwt(accessToken: string): void {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      console.log('[License] JWT claims:', { licensed: payload.licensed, ai_pro: payload.ai_pro, credits_remaining: payload.credits_remaining });
      this.claims = {
        sub:               payload.sub               ?? '',
        licensed:          payload.licensed          ?? false,
        ai_pro:            payload.ai_pro            ?? false,
        credits_remaining: payload.credits_remaining ?? 0,
        credit_quota:      payload.credit_quota      ?? 0,
      };
    } catch {
      this.claims = { ...DEFAULT_CLAIMS };
    }
  }

  private async handleRefreshFailure(reason: string): Promise<void> {
    const reactivated = await this.reactivateWithStoredLicenseKey();
    if (reactivated === 'reactivated') {
      return;
    }
    if (reactivated === 'terminal-failure') {
      await this.clearTokens();
      return;
    }

    console.warn(`[License] Session refresh failed; keeping cached one-time license state. ${reason}`);
  }

  private async reactivateWithStoredLicenseKey(): Promise<'reactivated' | 'no-key' | 'transient-failure' | 'terminal-failure'> {
    const licenseKey = this.storage.get(LICENSE_KEY_KEY);
    if (!licenseKey) return 'no-key';

    try {
      await this.activateWithLicenseKey(licenseKey);
      return 'reactivated';
    } catch (error) {
      if (error instanceof LicenseActivationError && this.isTerminalActivationError(error)) {
        return 'terminal-failure';
      }
      return 'transient-failure';
    }
  }

  private isTerminalActivationError(error: LicenseActivationError): boolean {
    return ['INVALID_KEY', 'REVOKED', 'DEVICE_MISMATCH', 'USER_NOT_FOUND'].includes(error.code);
  }

  private notifyClaimsChanged(): void {
    for (const cb of this.claimsChangedCallbacks) cb();
  }

  private async requestActivationToken(licenseKey: string): Promise<string> {
    const activationUrl = process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL}/functions/v1/licenses-activate`
      : '';
    if (!activationUrl) {
      throw new LicenseActivationError('AGENT_NOT_CONFIGURED');
    }

    try {
      const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
      const res = await fetch(activationUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          key:               licenseKey.trim(),
          deviceFingerprint: this.fingerprint.getFingerprint(),
          deviceName:        this.fingerprint.getDeviceName(),
        }),
      });

      const json = await res.json() as { hashed_token?: string; error?: string; message?: string };
      if (!res.ok || !json.hashed_token) {
        throw new LicenseActivationError(
          (json.error ?? json.message ?? 'UNKNOWN') as LicenseActivationErrorCode,
          res.status,
        );
      }

      return json.hashed_token;
    } catch (error) {
      if (error instanceof LicenseActivationError) throw error;
      throw new LicenseActivationError('NETWORK_ERROR');
    }
  }
}
