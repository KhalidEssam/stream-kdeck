import { app, Tray, Menu } from 'electron';
import path from 'path';
import { bootstrapNestJS } from './nestjs';

let tray: Tray | null = null;

app.whenReady().then(async () => {
  app.dock?.hide(); // macOS: hide from dock

  const iconPath = path.join(__dirname, '../assets/icon.png');
  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Control Surface Agent');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Control Surface Agent v0.1.0', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ])
    );
  } catch {
    console.warn('[Agent] Could not load tray icon — continuing without tray');
  }

  await bootstrapNestJS();
});

app.on('window-all-closed', (e: Event) => e.preventDefault());
