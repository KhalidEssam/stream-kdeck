import * as fs from 'fs';
import { execSync } from 'child_process';
import { AppSearchService } from '../src/app-search/app-search.service';

jest.mock('fs');
jest.mock('child_process', () => ({ execSync: jest.fn() }));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedExecSync = execSync as jest.Mock;

describe('AppSearchService', () => {
  let service: AppSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppSearchService();
  });

  describe('validatePath', () => {
    it('returns valid=false when file does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const result = await service.validatePath('C:\\NoSuch\\app.exe');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('returns valid=false for unsupported file type', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      const result = await service.validatePath('C:\\Apps\\readme.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not an executable or shortcut file');
    });

    it('returns valid=true with label and iconBase64 for existing exe', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockReturnValue(Buffer.from('FAKEBASE64'));
      const result = await service.validatePath('C:\\Apps\\MyGame.exe');
      expect(result.valid).toBe(true);
      expect(result.label).toBe('MyGame');
      expect(result.iconBase64).toBe('FAKEBASE64');
    });

    it('returns valid=true for existing Start Menu lnk file', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockReturnValue(Buffer.from('FAKEBASE64'));
      const result = await service.validatePath(
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\VALORANT.lnk',
      );
      expect(result.valid).toBe(true);
      expect(result.label).toBe('VALORANT');
      expect(result.iconBase64).toBe('FAKEBASE64');
    });

    it('returns valid=true even when icon extraction throws', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedExecSync.mockImplementation(() => { throw new Error('No icon'); });
      const result = await service.validatePath('C:\\Apps\\MyGame.exe');
      expect(result.valid).toBe(true);
      expect(result.label).toBe('MyGame');
      expect(result.iconBase64).toBeUndefined();
    });
  });

  describe('searchApps', () => {
    it('returns empty array when Start Menu PS returns null and no Steam/Epic dirs exist', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockReturnValue(false);
      const results = await service.searchApps('anything');
      expect(results).toEqual([]);
    });

    it('ignores PowerShell CLIXML progress noise before Start Menu JSON', async () => {
      mockedExecSync.mockReturnValue(Buffer.from(
        '#< CLIXML\r\n<Objs Version="1.1.0.1"></Objs>\r\n' +
          JSON.stringify([{ name: 'Slack', exePath: 'C:\\Apps\\Slack.exe' }])
      ));
      mockedFs.existsSync.mockReturnValue(false);
      const results = await service.searchApps('slack');
      expect(results).toEqual([
        { name: 'Slack', exePath: 'C:\\Apps\\Slack.exe', processName: 'Slack.exe', source: 'startmenu' },
      ]);
    });

    it('adds iconBase64 to local search results when the launch target exists', async () => {
      mockedExecSync
        .mockReturnValueOnce(Buffer.from(JSON.stringify([
          { name: 'Slack', exePath: 'C:\\Apps\\Slack.lnk', source: 'startmenu' },
        ])))
        .mockReturnValueOnce(Buffer.from('null'))
        .mockReturnValueOnce(Buffer.from('ICON'));
      mockedFs.existsSync.mockImplementation((p: any) => String(p) === 'C:\\Apps\\Slack.lnk');

      const results = await service.searchApps('slack');

      expect(results).toEqual([
        {
          name: 'Slack',
          exePath: 'C:\\Apps\\Slack.lnk',
          source: 'startmenu',
          iconBase64: 'ICON',
        },
      ]);
    });

    it('returns Windows registry results matching the query', async () => {
      mockedExecSync
        .mockReturnValueOnce(Buffer.from('null'))
        .mockReturnValueOnce(Buffer.from(JSON.stringify([
          { name: 'Battlefield™ 6', exePath: 'D:\\Battlefield 6\\bf6.exe', source: 'windows' },
        ])))
        .mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockReturnValue(false);

      const results = await service.searchApps('battlefield');

      expect(results).toEqual([
        { name: 'Battlefield™ 6', exePath: 'D:\\Battlefield 6\\bf6.exe', processName: 'bf6.exe', source: 'windows' },
      ]);
    });

    it('prefers a Start Menu shortcut over a registry exe with the same name', async () => {
      mockedExecSync
        .mockReturnValueOnce(Buffer.from(JSON.stringify([
          {
            name: 'VALORANT',
            exePath: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\VALORANT.lnk',
            source: 'startmenu',
          },
        ])))
        .mockReturnValueOnce(Buffer.from(JSON.stringify([
          { name: 'VALORANT', exePath: 'C:\\Riot Games\\VALORANT\\live\\VALORANT.exe', source: 'windows' },
        ])));
      mockedFs.existsSync.mockReturnValue(false);

      const results = await service.searchApps('valorant');

      expect(results).toEqual([
        {
          name: 'VALORANT',
          exePath: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\VALORANT.lnk',
          source: 'startmenu',
        },
      ]);
    });

    it('caps results at 30', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      const manifests = Array.from({ length: 35 }, (_, i) => `appmanifest_${i}.acf`);
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(manifests as any);
      mockedFs.readFileSync.mockImplementation((p: any) => {
        const m = String(p).match(/appmanifest_(\d+)\.acf/);
        const id = m?.[1] ?? '0';
        return `"AppState"\n{\n"appid"\t"${id}"\n"name"\t"Game ${id}"\n}\n`;
      });
      const results = await service.searchApps('game');
      expect(results.length).toBeLessThanOrEqual(30);
    });

    it('returns steam results matching the query', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(['appmanifest_570.acf'] as any);
      mockedFs.readFileSync.mockReturnValue(
        '"AppState"\n{\n"appid"\t"570"\n"name"\t"Dota 2"\n}\n'
      );
      const results = await service.searchApps('dota');
      const steam = results.find((r) => r.source === 'steam');
      expect(steam?.name).toBe('Dota 2');
      expect(steam?.exePath).toBe('steam://rungameid/570');
    });

    it('skips steam manifest when name does not match query', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('null'));
      mockedFs.existsSync.mockImplementation((p: any) => String(p).includes('steamapps'));
      mockedFs.readdirSync.mockReturnValue(['appmanifest_1.acf'] as any);
      mockedFs.readFileSync.mockReturnValue(
        '"AppState"\n{\n"appid"\t"1"\n"name"\t"Portal"\n}\n'
      );
      const results = await service.searchApps('dota');
      expect(results).toHaveLength(0);
    });
  });
});
