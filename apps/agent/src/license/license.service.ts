import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { SecureStorageService } from './secure-storage.service';

const REFRESH_TOKEN_KEY = 'refresh_token';
const CACHED_CLAIMS_KEY = 'cached_claims';
type SupabaseClientOptions = NonNullable<Parameters<typeof createClient>[2]>;
type SupabaseRealtimeTransport = NonNullable<SupabaseClientOptions['realtime']>['transport'];

export interface LicenseClaims {
  licensed: boolean;
  ai_pro: boolean;
  credits_remaining: number;
}

const DEFAULT_CLAIMS: LicenseClaims = { licensed: false, ai_pro: false, credits_remaining: 0 };

@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private claims: LicenseClaims = { ...DEFAULT_CLAIMS };
  private readonly supabase: SupabaseClient;

  constructor(private readonly storage: SecureStorageService) {
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

  async onApplicationBootstrap(): Promise<void> {
    this.loadCachedClaims();
    await this.refreshSession();
    console.log('[License] Boot claims:', this.getClaims());
  }

  async refreshSession(): Promise<void> {
    const refreshToken = this.storage.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return;

    try {
      const { data, error } = await this.supabase.auth.setSession({
        access_token:  '',
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        this.storage.delete(REFRESH_TOKEN_KEY);
        this.storage.delete(CACHED_CLAIMS_KEY);
        this.claims = { ...DEFAULT_CLAIMS };
        return;
      }

      this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
      this.updateClaimsFromJwt(data.session.access_token);
      this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
    } catch {
      // Network error — keep cached claims loaded in loadCachedClaims()
    }
  }

  async activateWithHashedToken(hashedToken: string): Promise<void> {
    const { data, error } = await this.supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'Session creation failed');
    }
    this.storage.set(REFRESH_TOKEN_KEY, data.session.refresh_token);
    this.updateClaimsFromJwt(data.session.access_token);
    this.storage.set(CACHED_CLAIMS_KEY, JSON.stringify(this.claims));
  }

  async decrementCredit(): Promise<void> {
    if (!this.claims.licensed || this.claims.credits_remaining <= 0) return;

    this.claims.credits_remaining = Math.max(0, this.claims.credits_remaining - 1);

    try {
      if (this.claims.ai_pro) {
        await this.supabase.rpc('decrement_subscription_credits');
      } else {
        await this.supabase.rpc('increment_license_credits_used');
      }
    } catch {
      // Non-fatal
    }
  }

  async clearTokens(): Promise<void> {
    this.storage.delete(REFRESH_TOKEN_KEY);
    this.storage.delete(CACHED_CLAIMS_KEY);
    this.claims = { ...DEFAULT_CLAIMS };
  }

  hasRefreshToken(): boolean {
    return !!this.storage.get(REFRESH_TOKEN_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  isLicensed(): boolean          { return this.claims.licensed; }
  isAiPro(): boolean             { return this.claims.ai_pro; }
  creditsRemaining(): number     { return this.claims.credits_remaining; }
  getClaims(): LicenseClaims     { return { ...this.claims }; }

  private loadCachedClaims(): void {
    const cached = this.storage.get(CACHED_CLAIMS_KEY);
    if (!cached) return;
    try { this.claims = JSON.parse(cached); } catch {}
  }

  private updateClaimsFromJwt(accessToken: string): void {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      console.log('[License] JWT claims:', { licensed: payload.licensed, ai_pro: payload.ai_pro, credits_remaining: payload.credits_remaining });
      this.claims = {
        licensed:          payload.licensed          ?? false,
        ai_pro:            payload.ai_pro            ?? false,
        credits_remaining: payload.credits_remaining ?? 0,
      };
    } catch {
      this.claims = { ...DEFAULT_CLAIMS };
    }
  }
}
