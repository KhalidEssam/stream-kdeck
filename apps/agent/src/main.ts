import { app, Tray, Menu } from 'electron';
import path from 'path';
import { bootstrapNestJS } from './nestjs';
import { LicenseService } from './license/license.service';
import { ActivationDialogService } from './license/activation-dialog.service';

let tray: Tray | null = null;

app.whenReady().then(async () => {
  app.dock?.hide();

  process.env.USER_DATA_PATH = app.getPath('userData');

  const { nestApp } = await bootstrapNestJS();

  const licenseService   = nestApp.get(LicenseService);
  const activationDialog = nestApp.get(ActivationDialogService);

  const buildTrayMenu = () =>
    Menu.buildFromTemplate([
      { label: 'KDeck Agent v0.1.0', enabled: false },
      { type: 'separator' },
      {
        label:   licenseService.isLicensed() ? 'Licensed ✓' : 'Activate License…',
        enabled: !licenseService.isLicensed(),
        click:   () => activationDialog.open(),
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

  if (!licenseService.hasRefreshToken()) {
    activationDialog.open();
  }
});

app.on('window-all-closed', () => { /* tray-only — stay alive */ });
