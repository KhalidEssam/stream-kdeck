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

  describe('launch', () => {
    it('resolves target and calls shell.openExternal', async () => {
      await service.launch('spotify');
      expect(mockRegistry.resolveTarget).toHaveBeenCalledWith('spotify');
      expect(shell.openExternal).toHaveBeenCalledWith('spotify://');
    });

    it('throws when registry throws (unknown app)', async () => {
      mockRegistry.resolveTarget.mockImplementation(() => { throw new Error('Unknown app: badapp'); });
      await expect(service.launch('badapp')).rejects.toThrow('Unknown app: badapp');
    });
  });

  describe('openUrl', () => {
    it('calls shell.openExternal with https URL', async () => {
      await service.openUrl('https://example.com');
      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('calls shell.openExternal with http URL', async () => {
      await service.openUrl('http://localhost:3000');
      expect(shell.openExternal).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('throws for a non-http URL', async () => {
      await expect(service.openUrl('ftp://example.com')).rejects.toThrow('Invalid URL');
    });

    it('throws for a bare string with no protocol', async () => {
      await expect(service.openUrl('example.com')).rejects.toThrow('Invalid URL');
    });
  });
});
