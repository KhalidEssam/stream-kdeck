import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

interface VsCodeStorage {
  openedPathsList?: {
    folders3?: unknown[];
    workspaces3?: unknown[];
  };
  windowsState?: {
    lastActiveWindow?: unknown;
    openedWindows?: unknown[];
  };
  backupWorkspaces?: {
    folders?: unknown[];
    workspaces?: unknown[];
  };
}

const PROJECT_MARKERS = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'];

export function isVsCodeProcessName(name: string | null): boolean {
  if (!name) return false;
  const normalized = path.basename(name).toLowerCase();
  return normalized === 'code.exe'
    || normalized === 'code - insiders.exe'
    || normalized === 'vscodium.exe';
}

function hasProjectMarker(dir: string): boolean {
  return PROJECT_MARKERS.some((marker) => {
    try { return fs.existsSync(path.join(dir, marker)); } catch { return false; }
  });
}

function decodePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (!value.startsWith('file:')) return value;
  try { return fileURLToPath(value); } catch { return null; }
}

function decodeWorkspaceEntry(entry: unknown): string | null {
  if (!entry) return null;
  if (typeof entry === 'string') return decodePath(entry);
  if (typeof entry !== 'object') return null;

  const record = entry as Record<string, unknown>;
  const folder = decodePath(record.folder) ?? decodePath(record.folderUri);
  if (folder) return folder;

  const workspace = decodePath(record.workspace)
    ?? decodePath(record.workspaceUri)
    ?? decodePath(record.configURI);
  if (!workspace) return null;

  return path.extname(workspace).toLowerCase() === '.code-workspace'
    ? path.dirname(workspace)
    : workspace;
}

function extractWorkspaceName(title: string): string | null {
  const parts = title.split(/\s*[\u2014\u2013]\s*|\s+-\s+/);
  const vscIdx = parts.findIndex((p) => /visual studio code/i.test(p));
  if (vscIdx > 0) {
    const candidate = parts[vscIdx - 1].trim();
    return candidate || null;
  }
  return null;
}

/**
 * Resolves the active VS Code workspace folder by reading VS Code's storage file.
 * Returns null if VS Code storage is unavailable or no valid workspace is found.
 */
export function resolveVsCodeWorkspace(windowTitle: string | null, storagePath = defaultStoragePath()): string | null {
  let storage: VsCodeStorage;
  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    storage = JSON.parse(raw) as VsCodeStorage;
  } catch {
    return null;
  }

  const folderPaths = collectWorkspaceCandidates(storage);

  if (windowTitle) {
    const workspaceName = extractWorkspaceName(windowTitle);
    if (workspaceName) {
      const match = folderPaths.find(
        (p) => path.basename(p).toLowerCase() === workspaceName.toLowerCase() && hasProjectMarker(p),
      );
      if (match) return match;
    }
  }

  return folderPaths.find(hasProjectMarker) ?? null;
}

function defaultStoragePath(): string {
  return path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'Code',
    'User',
    'globalStorage',
    'storage.json',
  );
}

function collectWorkspaceCandidates(storage: VsCodeStorage): string[] {
  const entries: unknown[] = [
    storage.windowsState?.lastActiveWindow,
    ...(storage.windowsState?.openedWindows ?? []),
    ...(storage.openedPathsList?.folders3 ?? []),
    ...(storage.openedPathsList?.workspaces3 ?? []),
    ...(storage.backupWorkspaces?.folders ?? []),
    ...(storage.backupWorkspaces?.workspaces ?? []),
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    const decoded = decodeWorkspaceEntry(entry);
    if (!decoded) continue;

    const normalized = path.normalize(decoded);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}
