jest.mock('electron', () => ({
  app: { isPackaged: true },
}));

jest.mock('electron-updater', () => ({
  autoUpdater: {
    on: jest.fn(),
    checkForUpdatesAndNotify: jest.fn(),
  },
}));

import { configureAgentAutoUpdates, getAgentUpdateConfig } from '../../src/updater/agent-updater';

describe('agent updater', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults packaged agents to the preview update channel', () => {
    expect(getAgentUpdateConfig({}, true)).toMatchObject({
      enabled: true,
      channel: 'preview',
    });
  });

  it('does not enable auto-updates outside packaged builds', () => {
    expect(getAgentUpdateConfig({}, false)).toMatchObject({
      enabled: false,
      channel: 'preview',
    });
  });

  it('configures electron-updater with the selected channel', () => {
    jest.useFakeTimers();
    const updater = {
      channel: '',
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      on: jest.fn(),
      checkForUpdatesAndNotify: jest.fn().mockResolvedValue(undefined),
    };

    const handle = configureAgentAutoUpdates(
      { enabled: true, channel: 'preview', checkIntervalMs: 60_000 },
      updater as never,
    );

    expect(updater.channel).toBe('preview');
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(true);
    expect(handle).toMatchObject({ enabled: true, channel: 'preview' });

    handle.dispose();
  });
});
