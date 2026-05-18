import { Test } from '@nestjs/testing';
import { LicenseService } from '../src/license/license.service';
import { SecureStorageService } from '../src/license/secure-storage.service';

// Mock @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: {
      setSession: jest.fn(),
      verifyOtp: jest.fn(),
      getSession: jest.fn(),
    },
    rpc: jest.fn().mockResolvedValue({}),
  }),
}));

describe('LicenseService', () => {
  let licenseService: LicenseService;
  let mockStorage: { get: jest.Mock; set: jest.Mock; delete: jest.Mock };
  let mockSupabase: { auth: { setSession: jest.Mock; verifyOtp: jest.Mock; getSession: jest.Mock } };

  beforeEach(async () => {
    mockStorage = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      delete: jest.fn(),
    };

    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LicenseService,
        { provide: SecureStorageService, useValue: mockStorage },
      ],
    }).compile();

    licenseService = moduleRef.get(LicenseService);
  });

  it('starts unlicensed with no stored token', async () => {
    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(false);
    expect(licenseService.creditsRemaining()).toBe(0);
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
  });

  it('refreshSession updates claims from JWT when refresh token exists', async () => {
    const payload = { licensed: true, ai_pro: true, credits_remaining: 480 };
    const fakeJwt = [
      'header',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'sig',
    ].join('.');

    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'fake-refresh-token' : null,
    );
    mockSupabase.auth.setSession.mockResolvedValue({
      data: {
        session: {
          access_token:  fakeJwt,
          refresh_token: 'new-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.onApplicationBootstrap();
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.isAiPro()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(480);
    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'new-refresh-token');
  });

  it('clears tokens and resets claims when session refresh fails', async () => {
    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'expired-token' : null,
    );
    mockSupabase.auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token expired' },
    });

    await licenseService.onApplicationBootstrap();

    expect(licenseService.isLicensed()).toBe(false);
    expect(mockStorage.delete).toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).toHaveBeenCalledWith('cached_claims');
  });

  it('activateWithHashedToken stores refresh token and updates claims', async () => {
    const payload = { licensed: true, ai_pro: false, credits_remaining: 50 };
    const fakeJwt = [
      'header',
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      'sig',
    ].join('.');

    mockSupabase.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token:  fakeJwt,
          refresh_token: 'stored-refresh-token',
        },
      },
      error: null,
    });

    await licenseService.activateWithHashedToken('some-hashed-token');

    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'stored-refresh-token');
    expect(licenseService.isLicensed()).toBe(true);
    expect(licenseService.creditsRemaining()).toBe(50);
  });

  it('clearTokens resets everything', async () => {
    await licenseService.clearTokens();
    expect(mockStorage.delete).toHaveBeenCalledWith('refresh_token');
    expect(mockStorage.delete).toHaveBeenCalledWith('cached_claims');
    expect(licenseService.isLicensed()).toBe(false);
  });

  it('hasRefreshToken returns true when token is stored', () => {
    mockStorage.get.mockImplementation((key: string) =>
      key === 'refresh_token' ? 'some-token' : null,
    );
    expect(licenseService.hasRefreshToken()).toBe(true);
  });
});
