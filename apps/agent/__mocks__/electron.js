// In-memory clipboard and shell mock for Jest — replaces Electron APIs in tests.
let _clipboard = '';

// In-memory store that simulates safeStorage encrypted file
const _store = {};

module.exports = {
  clipboard: {
    readText: () => _clipboard,
    writeText: (text) => { _clipboard = text; },
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
    openPath: jest.fn().mockResolvedValue(''),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(true),
    encryptString: jest.fn((str) => Buffer.from(str, 'utf-8')),
    decryptString: jest.fn((buf) => buf.toString('utf-8')),
  },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/test-cs-agent'),
    quit: jest.fn(),
    dock: { hide: jest.fn() },
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    on: jest.fn(),
    webContents: { send: jest.fn() },
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  Menu: { buildFromTemplate: jest.fn().mockReturnValue({}) },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
  })),
};
