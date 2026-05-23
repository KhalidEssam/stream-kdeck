import { Test } from '@nestjs/testing';
import { DeviceFingerprintService } from '../src/license/device-fingerprint.service';
import { LicenseActivationError, LicenseService } from '../src/license/license.service';
import { SecureStorageService } from '../src/license/secure-storage.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: {
      refreshSession: jest.fn(),
      verifyOtp:      jest.fn(),
      getSession:     jest.fn(),
    },
    rpc: jest.fn().mockResolvedValue({}),
  }),
}));

function fakeJwt(payload: Record<string, unknown>): string {
  return [
    'header',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'sig',
  ].join('.');
}

describe('LicenseService', () => {
  let licenseService: LicenseService;
  let mockStorage: { get: jest.Mock; set: jest.Mock; delete: jest.Mock };
  let mockFingerprint: { getFingerprint: jest.Mock; getDeviceName: jest.Mock };
  let mockSupabase: {
    auth: {
      refreshSession: jest.Mock;
      verifyOtp: jest.Mock;
      getSession: jest.Mock;
    };
  };
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    };

    mockStorage = {
      get:    jest.fn().mockReturnValue(null),
      set:    jest.fn(),
      delete: jest.fn(),
    };
    mockFingerprint = {
      getFingerprint: jest.fn().mockReturnValue('device-fingerprint'),
      getDeviceName:  jest.fn().mockReturnValue('desktop-name'),
    };

    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();
    mockSupabase.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabase.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LicenseService,
        { provide: SecureStorageService, useValue: mockStorage },
        { provide: DeviceFingerprintService, useValue: mockFingerprint },
      ],
    }).compile();

    licenseService = moduleRef.get(LicenseService);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('starts unlicensed with no stored token', async () => {
    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(false);
    expect(licenseService.creditsRemaining()).toBe(0);
    expect(licenseService.getUserId()).toBeNull();
  });

  it('creates Supabase client with ws transport for Node 20 realtime support', () => {
    const { createClient } = require('@supabase/supabase-js');
    expect(createClient).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        realtime: expect.objectContaining({
          transport: expect.any(Function),
        }),
      }),
    );
  });

  it('loads cached claims from storage when present', async () => {
    mockStorage.get.mockImplementation((key: string) => {
      if (key === 'cached_claims') {
        return JSON.stringify({ licensed: true, ai_pro: false, credits_remaining: 42 });
      }
      return null;
    });

    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(42);
    expect(licenseService.getClaims().credit_quota).toBe(0);
  });

  it('refreshSession updates claims from JWT when refresh token exists', async () => {
    const accessToken = fakeJwt({
      sub: 'user-abc',
      licensed: true,
      ai_pro: true,
      credits_remaining: 480,
      credit_quota: 500,
    });

    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'fake-refresh-token' : null,
    );
    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token:  accessToken,
          refresh_token: 'new-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.isAiPro()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(480);
    expect(licenseService.getClaims().credit_quota).toBe(500);
    expect(licenseService.getUserId()).toBe('user-abc');
    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'new-refresh-token');
  });

  it('keeps cached one-time license claims when session refresh fails', async () => {
    mockStorage.get.mockImplementation((key: string) => {
      if (key === 'refresh_token') return 'expired-token';
      if (key === 'cached_claims') {
        return JSON.stringify({ licensed: true, ai_pro: false, credits_remaining: 12, credit_quota: 20 });
      }
      return null;
    });
    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    });

    await licenseService.onApplicationBootstrap();

    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(12);
    expect(mockStorage.delete).not.toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).not.toHaveBeenCalledWith('cached_claims');
  });

  it('reactivates with the stored license key when session refresh fails', async () => {
    const accessToken = fakeJwt({ licensed: true, ai_pro: false, credits_remaining: 20, credit_quota: 20 });
    mockStorage.get.mockImplementation((key: string) => {
      if (key === 'refresh_token') return 'expired-token';
      if (key === 'license_key') return 'CS-TEST-KEY';
      return null;
    });
    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:     true,
      status: 200,
      json:   async () => ({ hashed_token: 'hashed-token' }),
    });
    mockSupabase.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token:  accessToken,
          refresh_token: 'fresh-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.onApplicationBootstrap();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/licenses-activate',
      expect.objectContaining({
        method: 'POST',
        body:   JSON.stringify({
          key:               'CS-TEST-KEY',
          deviceFingerprint: 'device-fingerprint',
          deviceName:        'desktop-name',
        }),
      }),
    );
    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'fresh-refresh-token');
    expect(mockStorage.set).toHaveBeenCalledWith('license_key', 'CS-TEST-KEY');
    expect(licenseService.isLicensed()).toBe(true);
  });

  it('activateWithLicenseKey stores refresh token, license key, and claims', async () => {
    const accessToken = fakeJwt({ licensed: true, ai_pro: false, credits_remaining: 50, credit_quota: 50 });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:     true,
      status: 200,
      json:   async () => ({ hashed_token: 'hashed-token' }),
    });
    mockSupabase.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token:  accessToken,
          refresh_token: 'stored-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.activateWithLicenseKey('CS-TEST-KEY');

    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'stored-refresh-token');
    expect(mockStorage.set).toHaveBeenCalledWith('license_key', 'CS-TEST-KEY');
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(50);
  });

  it('throws a typed activation error when the activation endpoint rejects the key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:     false,
      status: 400,
      json:   async () => ({ error: 'INVALID_KEY' }),
    });

    await expect(licenseService.activateWithLicenseKey('bad-key')).rejects.toMatchObject(
      new LicenseActivationError('INVALID_KEY', 400),
    );
  });

  it('clearTokens resets everything', async () => {
    await licenseService.clearTokens();
    expect(mockStorage.delete).toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).toHaveBeenCalledWith('cached_claims');
    expect(mockStorage.delete).toHaveBeenCalledWith('license_key');
    expect(licenseService.isLicensed()).toBe(false);
  });

  it('hasRefreshToken returns true when token or stored license key exists', () => {
    mockStorage.get.mockImplementation((key: string) =>
      key === 'license_key' ? 'CS-TEST-KEY' : null,
    );
    expect(licenseService.hasRefreshToken()).toBe(true);
  });
});
