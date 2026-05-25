import { BrowserWindow } from 'electron';
import { getLanWebSocketUrls } from './agent-addresses';

export function openConnectionInfoDialog(port: number): Promise<void> {
  const urls = getLanWebSocketUrls(port);

  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 520,
      height: 430,
      resizable: false,
      center: true,
      title: 'KDeck Agent address',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(urls, port))}`);
    window.on('closed', resolve);
  });
}

function buildHtml(urls: string[], port: number): string {
  const primary = urls[0] ?? '';
  const list = urls.length
    ? urls.map((url, index) => `
      <div class="url-row">
        <input readonly value="${escapeAttr(url)}" aria-label="KDeck Agent address ${index + 1}">
        <button onclick="copyText('${escapeJs(url)}', this)">Copy</button>
      </div>
    `).join('')
    : `<p class="warning">No LAN IP address was detected. Make sure Wi-Fi or Ethernet is connected, then restart KDeck Agent.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0F0F14;
      color: #fff;
      padding: 28px;
    }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 12px; color: #9A9AAF; line-height: 1.5; margin-bottom: 18px; }
    .hint {
      background: #171727;
      border: 1px solid #292942;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .hint strong { color: #fff; }
    .url-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 132px;
      overflow-y: auto;
    }
    .url-row { display: grid; grid-template-columns: 1fr 84px; gap: 8px; }
    input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #33334C;
      background: #1A1A2E;
      color: #fff;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      outline: none;
    }
    button {
      border: none;
      border-radius: 8px;
      background: #5B4FE8;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      padding: 10px 12px;
    }
    button.secondary {
      width: 100%;
      margin-top: 16px;
      background: #232337;
    }
    button.ok {
      width: 100%;
      margin-top: 10px;
    }
    .warning { color: #FFB86C; }
    .fine { margin-top: 12px; margin-bottom: 0; font-size: 11px; color: #77778D; }
  </style>
</head>
<body>
  <h2>KDeck Agent is running</h2>
  <p>Use one of these addresses if the mobile app cannot find this PC automatically.</p>
  <div class="hint">
    <p><strong>Mobile app:</strong> paste the address into the manual connection field. Pick the address that matches your phone's Wi-Fi network.</p>
    <p class="fine">Agent port: ${port}. Auto-discovery still runs in the background.</p>
  </div>
  <div class="url-list">${list}</div>
  ${primary ? `<button class="secondary" onclick="copyText('${escapeJs(primary)}', this)">Copy first address</button>` : ''}
  <button class="ok" onclick="window.close()">OK</button>
  <script>
    const { clipboard } = require('electron');
    function copyText(text, button) {
      clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = old; }, 1200);
    }
  </script>
</body>
</html>`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
