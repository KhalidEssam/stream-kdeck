import * as fs from 'fs';
import * as path from 'path';
import { AppRegistryService } from '../src/app-launch/app-registry.service';

const TEST_CONFIG_PATH = path.join(__dirname, '../apps.config.test.json');

jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeService(config: { tiles: any[]; overrides: Record<string, string> } = { tiles: [], overrides: {} }): AppRegistryService {
  mockedFs.existsSync.mockReturnValue(true);
  mockedFs.readFileSync.mockReturnValue(JSON.stringify(config));
  mockedFs.writeFileSync.mockImplementation(() => undefined);
  return new AppRegistryService();
}

const AI_TILE_COUNT = 6; // DEFAULT_AI_TILES always prepended by getTiles()

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
    it('always includes the 6 built-in AI tiles even with empty config', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      const tiles = svc.getTiles();
      expect(tiles).toHaveLength(AI_TILE_COUNT);
      expect(tiles.every((t) => t.kind === 'ai')).toBe(true);
      expect(tiles[0].id).toBe('builtin-ai-explain');
    });

    it('prepends AI tiles before user-configured tiles', () => {
      const svc = makeService({
        tiles: [{ kind: 'app', label: 'Spotify', iconId: 'spotify', action: { kind: 'APP_LAUNCH', appId: 'spotify' } }],
        overrides: {},
      });
      const tiles = svc.getTiles();
      expect(tiles).toHaveLength(AI_TILE_COUNT + 1);
      const spotifyTile = tiles.find((t) => t.label === 'Spotify');
      expect(spotifyTile).toBeDefined();
      expect(spotifyTile!.id).toMatch(/^[0-9a-f-]{36}$/);
      // Stable: same id on every call
      expect(svc.getTiles().find((t) => t.label === 'Spotify')!.id).toBe(spotifyTile!.id);
    });
  });

  describe('addTile', () => {
    it('appends a user tile with a stable UUID and writes config to disk', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      svc.addTile({ kind: 'url', label: 'My Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } });
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
      const tiles = svc.getTiles();
      expect(tiles).toHaveLength(AI_TILE_COUNT + 1);
      const mySite = tiles.find((t) => t.label === 'My Site')!;
      expect(mySite).toBeDefined();
      expect(mySite.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does not add a duplicate (same action) twice', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      const tile = { kind: 'app' as const, label: 'Spotify', iconId: 'spotify', action: { kind: 'APP_LAUNCH' as const, appId: 'spotify' } };
      svc.addTile(tile);
      svc.addTile(tile);
      expect(svc.getTiles()).toHaveLength(AI_TILE_COUNT + 1);
    });
  });

  describe('removeTile', () => {
    it('removes a user tile by id and writes config', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      svc.addTile({ kind: 'url', label: 'My Site', iconId: 'globe', action: { kind: 'URL_OPEN', url: 'https://example.com' } });
      const id = svc.getTiles().find((t) => t.label === 'My Site')!.id;
      svc.removeTile(id);
      expect(svc.getTiles()).toHaveLength(AI_TILE_COUNT);
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2); // add + remove
    });

    it('cannot remove built-in AI tiles (they are not in config)', () => {
      const svc = makeService({ tiles: [], overrides: {} });
      svc.removeTile('builtin-ai-explain');
      // Still has all AI tiles
      expect(svc.getTiles()).toHaveLength(AI_TILE_COUNT);
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

    it('includes spotify, discord, and whatsapp', () => {
      const svc = makeService();
      const ids = svc.getBuiltInApps().map((a) => a.appId);
      expect(ids).toContain('spotify');
      expect(ids).toContain('discord');
      expect(ids).toContain('whatsapp');
    });
  });
});
