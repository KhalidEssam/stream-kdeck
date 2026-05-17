// In-memory clipboard mock — keeps tests isolated from the real system clipboard.
let _clipboard = '';

const clipboardy = {
  read: async () => _clipboard,
  write: async (text) => { _clipboard = text; },
};

module.exports = clipboardy;
module.exports.default = clipboardy;
