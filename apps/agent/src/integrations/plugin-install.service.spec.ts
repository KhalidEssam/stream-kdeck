const mockEq     = jest.fn();
const mockEq2    = jest.fn();
const mockIsNull = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockFrom   = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

const mockLicenseService = {
  getUserId: jest.fn<string | null, []>(() => 'user-123'),
  getAccessToken: jest.fn<Promise<string | null>, []>().mockResolvedValue(null),
};

import { PluginInstallService } from './plugin-install.service';

describe('PluginInstallService', () => {
  let service: PluginInstallService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq2 });
    mockEq2.mockReturnValue({ is: mockIsNull });
    mockIsNull.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ error: null });

    service = new PluginInstallService(mockLicenseService as any);
  });

  it('returns empty array before fetch', () => {
    expect(service.getInstalledPluginIds()).toEqual([]);
  });

  it('fetchInstalled populates installed set', async () => {
    mockIsNull.mockResolvedValue({
      data: [{ plugin_id: 'uuid-obs' }, { plugin_id: 'uuid-twitch' }],
      error: null,
    });

    await service.fetchInstalled();

    expect(service.getInstalledPluginIds()).toEqual(['uuid-obs', 'uuid-twitch']);
    expect(service.isInstalled('uuid-obs')).toBe(true);
    expect(service.isInstalled('uuid-missing')).toBe(false);
  });

  it('install writes to Supabase and updates local set', async () => {
    await service.install('uuid-obs');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ plugin_id: 'uuid-obs', status: 'installed' }),
      expect.anything(),
    );
    expect(service.isInstalled('uuid-obs')).toBe(true);
  });

  it('uninstall soft-deletes and removes from local set', async () => {
    await service.install('uuid-obs');
    await service.uninstall('uuid-obs');

    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ plugin_id: 'uuid-obs', status: 'uninstalled' }),
      expect.anything(),
    );
    expect(service.isInstalled('uuid-obs')).toBe(false);
  });

  it('install is a no-op when userId is null', async () => {
    mockLicenseService.getUserId.mockReturnValue(null);
    mockLicenseService.getAccessToken.mockResolvedValue(null);
    const result = await service.install('uuid-obs');
    expect(result.success).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
