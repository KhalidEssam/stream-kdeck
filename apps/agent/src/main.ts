import { app, Tray, Menu, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { bootstrapNestJS } from './nestjs';
import { LicenseService } from './license/license.service';
import { ActivationDialogService } from './license/activation-dialog.service';
import { configureAgentAutoUpdates, type AgentUpdaterHandle } from './updater/agent-updater';
import { openConnectionInfoDialog } from './network/connection-info-dialog';

let tray: Tray | null = null;
let updater: AgentUpdaterHandle | null = null;

app.whenReady().then(startAgent).catch(reportStartupFailure);

async function startAgent(): Promise<void> {
  app.dock?.hide();

  process.env.USER_DATA_PATH = app.getPath('userData');

  const { nestApp, port } = await bootstrapNestJS();

  const licenseService   = nestApp.get(LicenseService);
  const activationDialog = nestApp.get(ActivationDialogService);
  const updateHandle = configureAgentAutoUpdates();
  updater = updateHandle;

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      { label: `KDeck Agent v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      {
        label:   licenseService.isLicensed() ? 'Licensed ✓' : 'Activate License…',
        enabled: !licenseService.isLicensed(),
        click:   () => activationDialog.open(),
      },
      { type: 'separator' },
      { label: `Updates: ${updateHandle.enabled ? updateHandle.channel : 'disabled'}`, enabled: false },
      {
        label:   'Check for Updates',
        enabled: updateHandle.enabled,
        click:   () => { void updateHandle.checkNow(); },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);

  const iconPath = path.join(__dirname, '../assets/icon.png');
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('KDeck Agent');
    tray.setContextMenu(buildTrayMenu());
  } catch {
    console.warn('[Agent] Could not load tray icon — continuing without tray');
  }

  activationDialog.onActivated(() => {
    tray?.setContextMenu(buildTrayMenu());
  });

  await openConnectionInfoDialog(port);

  if (!licenseService.hasRefreshToken()) {
    activationDialog.open();
  }
}

function reportStartupFailure(error: unknown): void {
  const detail = formatError(error);
  let message = detail;
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `[${new Date().toISOString()}]\n${detail}\n`, 'utf8');
    message = `${detail}\n\nA startup log was written to:\n${logPath}`;
  } catch {
    // Keep the original error visible even if logging fails.
  }

  dialog.showErrorBox('KDeck Agent failed to start', message);
  app.quit();
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

app.on('window-all-closed', () => { /* tray-only - stay alive */ });
app.on('before-quit', () => {
  updater?.dispose();
  updater = null;
});
