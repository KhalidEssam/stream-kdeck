// In-memory clipboard and shell mock for Jest — replaces Electron APIs in tests.
let _clipboard = '';

module.exports = {
  clipboard: {
    readText: () => _clipboard,
    writeText: (text) => { _clipboard = text; },
  },
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
};
