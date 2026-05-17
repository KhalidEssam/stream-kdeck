import * as fs from 'fs';
import * as path from 'path';
import { AppRegistryService } from '../src/app-launch/app-registry.service';

// Isolate config file for tests
const TEST_CONFIG_PATH = path.join(__dirname, '../apps.config.test.json');

// Patch the CONFIG_PATH by writing to a separate test file and pointing the service at it.
// We achieve this by mocking 'fs' reads to use our test config.
jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeService(config: { tiles: any[]; overrides: Record<string, string> } = { tiles: [], overrides: {} }): AppRegistryService {
  mockedFs.existsSync.mockReturnValue(true);
  mockedFs.readFileSync.mockReturnValue(JSON.stringify(config));
  mockedFs.writeFileSync.mockImplementation(() => undefined);
  return new AppRegistryService();
}

describe('AppRegistryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveTarget', () => {
    it('resolves a known app on the current platform', () => {
      const svc = makeService();
      const target = svc.resolveTarget('spotify');
      expect(typeof target).toBe('string');
      expect(target.length).toBeGreaterThan(0);
    });

    it('throws for an unknown appId', () => {
      const svc = makeService();
      expect(() => svc.resolveTarget('doesnotexist')).toThrow('Unknown app: doesnotexist');
    });

    it('uses override when present', () => {
      const svc = makeService({ tiles: [], overrides: { spotify: 'C:\\custom\\spotify.exe' } });
      expect(svc.resolveTarget('spotify')).toBe('C:\\custom\\spotify.exe');
    });
  });

  describe('getTiles', () => {
    it('returns empty array when config has no tiles', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      expect(svc.getTiles()).toEqual([]);
    });

    it('returns tiles with stable IDs (migrates tiles that had no id)', () => {
      const svc = makeService({
        tiles: [{ kind: 'app', label: 'Spotify', iconId: 'spotify', action: { kind: 'APP_LAUNCH', appId: 'spotify' } }],
        overrides: {},
      });
      const tiles = svc.getTiles();
      expect(tiles).toHaveLength(1);
      expect(tiles[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tiles[0].label).toBe('Spotify');
      // Stable: same id on every call
      expect(svc.getTiles()[0].id).toBe(tiles[0].id);
    });
  });

  describe('addTile', () => {
    it('appends tile with a stable UUID and writes config to disk', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      svc.addTile({ kind: 'url', label: 'My Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } });
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
      const tiles = svc.getTiles();
      expect(tiles).toHaveLength(1);
      expect(tiles[0].label).toBe('My Site');
      expect(tiles[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does not add a duplicate (same action) twice', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      const tile = { kind: 'app' as const, label: 'Spotify', iconId: 'spotify', action: { kind: 'APP_LAUNCH' as const, appId: 'spotify' } };
      svc.addTile(tile);
      svc.addTile(tile);
      expect(svc.getTiles()).toHaveLength(1);
    });
  });

  describe('removeTile', () => {
    it('removes a tile by id and writes config', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      svc.addTile({ kind: 'url', label: 'My Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } });
      const id = svc.getTiles()[0].id;
      svc.removeTile(id);
      expect(svc.getTiles()).toHaveLength(0);
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2); // add + remove
    });

    it('is a no-op for an unknown id', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      expect(() => svc.removeTile('nonexistent-id')).not.toThrow();
    });
  });

  describe('getBuiltInApps', () => {
    it('returns at least 10 built-in apps', () => {
      const svc = makeService();
      expect(svc.getBuiltInApps().length).toBeGreaterThanOrEqual(10);
    });

    it('includes spotify and discord', () => {
      const svc = makeService();
      const ids = svc.getBuiltInApps().map((a) => a.appId);
      expect(ids).toContain('spotify');
      expect(ids).toContain('discord');
    });
  });
});
