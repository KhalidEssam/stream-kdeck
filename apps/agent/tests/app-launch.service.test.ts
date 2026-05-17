import { Test } from '@nestjs/testing';
import { AppLaunchService } from '../src/app-launch/app-launch.service';
import { AppRegistryService } from '../src/app-launch/app-registry.service';
import { shell } from 'electron';

describe('AppLaunchService', () => {
  let service: AppLaunchService;
  let mockRegistry: { resolveTarget: jest.Mock };

  beforeEach(async () => {
    mockRegistry = { resolveTarget: jest.fn().mockReturnValue('spotify://') };
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppLaunchService,
        { provide: AppRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    service = moduleRef.get(AppLaunchService);
  });

  describe('launch with protocol/URL targets', () => {
    it('uses shell.openExternal for protocol targets (e.g. spotify://)', async () => {
      mockRegistry.resolveTarget.mockReturnValue('spotify://');
      await service.launch('spotify');
      expect(shell.openExternal).toHaveBeenCalledWith('spotify://');
      expect(shell.openPath).not.toHaveBeenCalled();
    });

    it('uses shell.openExternal for web URL targets', async () => {
      mockRegistry.resolveTarget.mockReturnValue('https://claude.ai');
      await service.launch('claude');
      expect(shell.openExternal).toHaveBeenCalledWith('https://claude.ai');
      expect(shell.openPath).not.toHaveBeenCalled();
    });

    it('throws when registry throws (unknown app)', async () => {
      mockRegistry.resolveTarget.mockImplementation(() => { throw new Error('Unknown app: badapp'); });
      await expect(service.launch('badapp')).rejects.toThrow('Unknown app: badapp');
    });
  });

  describe('launch with exe path targets', () => {
    it('uses shell.openPath for Windows absolute exe paths', async () => {
      mockRegistry.resolveTarget.mockReturnValue('C:\\Users\\PC\\AppData\\Local\\Programs\\claude\\Claude.exe');
      await service.launch('claude');
      expect(shell.openPath).toHaveBeenCalledWith('C:\\Users\\PC\\AppData\\Local\\Programs\\claude\\Claude.exe');
      expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it('uses shell.openPath for Unix absolute paths', async () => {
      mockRegistry.resolveTarget.mockReturnValue('/Applications/VSCode.app');
      await service.launch('vscode');
      expect(shell.openPath).toHaveBeenCalledWith('/Applications/VSCode.app');
    });

    it('throws when shell.openPath returns an error string', async () => {
      mockRegistry.resolveTarget.mockReturnValue('C:\\NonExistent\\app.exe');
      (shell.openPath as jest.Mock).mockResolvedValue('No such file or directory');
      await expect(service.launch('badapp')).rejects.toThrow('Failed to launch badapp');
    });
  });

  describe('openUrl', () => {
    it('calls shell.openExternal with https URL', async () => {
      await service.openUrl('https://example.com');
      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('throws for a non-http URL', async () => {
      await expect(service.openUrl('ftp://example.com')).rejects.toThrow('Invalid URL');
    });

    it('throws for a bare string with no protocol', async () => {
      await expect(service.openUrl('example.com')).rejects.toThrow('Invalid URL');
    });
  });
});
