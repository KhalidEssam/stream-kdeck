import { Test } from '@nestjs/testing';
import { AiRouterService, AiQuotaError } from '../src/ai/ai-router.service';
import { LicenseService } from '../src/license/license.service';

const mockLicenseService = {
  getAccessToken: jest.fn<Promise<string | null>, []>(),
};

describe('AiRouterService', () => {
  let service: AiRouterService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiRouterService,
        { provide: LicenseService, useValue: mockLicenseService },
      ],
    }).compile();
    service = moduleRef.get(AiRouterService);
  });

  it('throws when not authenticated', async () => {
    mockLicenseService.getAccessToken.mockResolvedValue(null);
    await expect(service.call('hello', '')).rejects.toThrow('Not authenticated');
  });

  it('throws when SUPABASE_URL is missing', async () => {
    mockLicenseService.getAccessToken.mockResolvedValue('tok');
    const saved = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    await expect(service.call('hello', '')).rejects.toThrow('SUPABASE_URL not configured');
    process.env.SUPABASE_URL = saved;
  });

  it('throws AiQuotaError on 402 from proxy', async () => {
    mockLicenseService.getAccessToken.mockResolvedValue('tok');
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 402 } as Response);
    await expect(service.call('hello', '')).rejects.toBeInstanceOf(AiQuotaError);
    delete process.env.SUPABASE_URL;
  });

  it('throws on non-ok proxy response', async () => {
    mockLicenseService.getAccessToken.mockResolvedValue('tok');
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500,
      json: jest.fn().mockResolvedValue({ error: 'AI_NOT_CONFIGURED' }),
    } as unknown as Response);
    await expect(service.call('hello', '')).rejects.toThrow('AI_NOT_CONFIGURED');
    delete process.env.SUPABASE_URL;
  });

  it('returns text from successful proxy response', async () => {
    mockLicenseService.getAccessToken.mockResolvedValue('tok');
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: jest.fn().mockResolvedValue({ text: 'hello world' }),
    } as unknown as Response);
    const result = await service.call('say hello', '');
    expect(result).toBe('hello world');
    delete process.env.SUPABASE_URL;
  });
});
