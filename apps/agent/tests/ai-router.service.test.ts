import { Test } from '@nestjs/testing';
import { AiRouterService } from '../src/ai/ai-router.service';
import { LicenseService } from '../src/license/license.service';

describe('AiRouterService', () => {
  let service: AiRouterService;

  const mockLicenseService = {
    decrementCredit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiRouterService,
        { provide: LicenseService, useValue: mockLicenseService },
      ],
    }).compile();
    service = moduleRef.get(AiRouterService);
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('throws a descriptive error when no API key is configured', async () => {
    await expect(service.call('hello', '')).rejects.toThrow(
      'No AI provider configured'
    );
  });

  // Integration test — runs only when GEMINI_API_KEY is set in the environment.
  // Run: GEMINI_API_KEY=your_key npx jest tests/ai-router.service.test.ts
  it('returns a non-empty string from Gemini Flash (integration)', async () => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Skipping integration test: GEMINI_API_KEY not set');
      return;
    }
    const result = await service.call('Say only the word "hello".', '');
    expect(typeof result).toBe('string');
    expect(result.trim().length).toBeGreaterThan(0);
  }, 15_000);
});
