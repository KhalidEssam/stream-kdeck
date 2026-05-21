import { app } from 'electron';
import { autoUpdater, type AppUpdater } from 'electron-updater';

export interface AgentUpdateConfig {
  enabled: boolean;
  channel: string;
  checkIntervalMs: number;
}

export interface AgentUpdaterHandle {
  enabled: boolean;
  channel: string;
  checkNow: () => Promise<void>;
  dispose: () => void;
}

const DEFAULT_UPDATE_CHANNEL = 'preview';
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 30 * 1000;

export function getAgentUpdateConfig(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged = Boolean(app.isPackaged),
): AgentUpdateConfig {
  const channel = normalizeChannel(env.KDECK_AGENT_UPDATE_CHANNEL) ?? DEFAULT_UPDATE_CHANNEL;
  const disabled = env.KDECK_AGENT_UPDATES_DISABLED === '1' || env.KDECK_AGENT_UPDATES_DISABLED === 'true';
  const checkIntervalMs = normalizePositiveInt(env.KDECK_AGENT_UPDATE_CHECK_INTERVAL_MS)
    ?? DEFAULT_CHECK_INTERVAL_MS;

  return {
    enabled: isPackaged && !disabled,
    channel,
    checkIntervalMs,
  };
}

export function configureAgentAutoUpdates(
  config = getAgentUpdateConfig(),
  updater: AppUpdater = autoUpdater,
): AgentUpdaterHandle {
  let firstCheckTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const checkNow = async () => {
    if (!config.enabled) return;
    try {
      await updater.checkForUpdatesAndNotify();
    } catch (error) {
      logUpdateError(error);
    }
  };

  if (!config.enabled) {
    console.log('[Agent] Auto-update: disabled for this run');
    return {
      enabled: false,
      channel: config.channel,
      checkNow,
      dispose: () => undefined,
    };
  }

  updater.channel = config.channel;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = config.channel !== 'latest';

  updater.on('checking-for-update', () => {
    console.log(`[Agent] Auto-update: checking channel "${config.channel}"`);
  });
  updater.on('update-available', (info) => {
    console.log(`[Agent] Auto-update: version ${info.version} available`);
  });
  updater.on('update-not-available', (info) => {
    console.log(`[Agent] Auto-update: no update available (current ${info.version})`);
  });
  updater.on('update-downloaded', (info) => {
    console.log(`[Agent] Auto-update: version ${info.version} downloaded; will install on quit`);
  });
  updater.on('error', logUpdateError);

  firstCheckTimer = setTimeout(() => {
    void checkNow();
  }, FIRST_CHECK_DELAY_MS);
  intervalTimer = setInterval(() => {
    void checkNow();
  }, config.checkIntervalMs);

  console.log(`[Agent] Auto-update: enabled on "${config.channel}" channel`);

  return {
    enabled: true,
    channel: config.channel,
    checkNow,
    dispose: () => {
      if (firstCheckTimer) clearTimeout(firstCheckTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      firstCheckTimer = null;
      intervalTimer = null;
    },
  };
}

function normalizeChannel(value: string | undefined): string | null {
  const channel = value?.trim().toLowerCase();
  if (!channel) return null;
  return /^[a-z0-9][a-z0-9._-]*$/.test(channel) ? channel : null;
}

function normalizePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function logUpdateError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Agent] Auto-update: ${message}`);
}
