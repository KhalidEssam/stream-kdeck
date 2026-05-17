import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { AppSearchResult } from '@control-surface/shared';

type PowerShellAppResult = {
  name?: string;
  exePath?: string;
  source?: AppSearchResult['source'];
};

@Injectable()
export class AppSearchService {
  private readonly iconCache = new Map<string, string | undefined>();

  private runPowerShell(script: string, timeout: number): string {
    const quietScript = `
$ProgressPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
${script}
`;
    const encoded = Buffer.from(quietScript, 'utf16le').toString('base64');
    const output = execSync(
      `powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();

    return output.replace(/^#< CLIXML[\s\S]*?<\/Objs>\s*/i, '').trim();
  }

  async searchApps(query: string): Promise<AppSearchResult[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results: AppSearchResult[] = [];
    const sources: Array<[string, () => AppSearchResult[]]> = [
      ['startmenu', () => this.searchStartMenu(q)],
      ['steam', () => this.searchSteam(q)],
      ['epic', () => this.searchEpic(q)],
      ['windows', () => this.searchWindowsRegistry(q)],
    ];

    for (const [source, search] of sources) {
      try {
        const sourceResults = search();
        console.log(`[AppSearch] ${source}: ${sourceResults.length} result(s)`);
        results.push(...sourceResults);
      } catch (err) {
        console.warn(`[AppSearch] ${source} failed: ${this.formatError(err)}`);
      }
    }

    if (results.length === 0) {
      try {
        const fallbackResults = this.searchKnownInstallDirs(q);
        console.log(`[AppSearch] filesystem: ${fallbackResults.length} fallback result(s)`);
        results.push(...fallbackResults);
      } catch (err) {
        console.warn(`[AppSearch] filesystem failed: ${this.formatError(err)}`);
      }
    }

    return this.withIcons(this.rankAndDedupeResults(results).slice(0, 30));
  }

  private searchStartMenu(query: string): AppSearchResult[] {
    const ps = `
$shell = New-Object -ComObject WScript.Shell
$paths = @(
  ([System.Environment]::GetFolderPath('StartMenu') + '\\Programs'),
  ([System.Environment]::GetFolderPath('CommonStartMenu') + '\\Programs')
)
$out = @()
foreach ($p in $paths) {
  if (Test-Path $p) {
    Get-ChildItem -Path $p -Recurse -Force -File | Where-Object { $_.Extension -in '.lnk','.url','.appref-ms' } | ForEach-Object {
      try {
        if ($_.Extension -eq '.url') {
          $urlLine = Get-Content -Path $_.FullName -ErrorAction SilentlyContinue | Where-Object { $_ -like 'URL=*' } | Select-Object -First 1
          if ($urlLine) {
            $out += [PSCustomObject]@{ name = $_.BaseName; exePath = $urlLine.Substring(4); source = 'startmenu' }
          }
        } else {
          # Launch the shortcut itself so launcher-specific arguments are preserved.
          $out += [PSCustomObject]@{ name = $_.BaseName; exePath = $_.FullName; source = 'startmenu' }
        }
      } catch {}
    }
  }
}
if ($out.Count -gt 0) { $out | ConvertTo-Json -Compress -Depth 3 } else { 'null' }
`;
    const raw = this.runPowerShell(ps, 15000);
    return this.parsePowerShellAppResults(raw, 'startmenu')
      .filter((item) => this.matchesQuery(item.name, query, item.exePath));
  }

  private searchWindowsRegistry(query: string): AppSearchResult[] {
    const ps = `
function Get-ExecutablePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $Text = $Value.Trim()
  $Quoted = [regex]::Match($Text, '^"([^"]+\\.(?:exe|lnk|appref-ms))"', 'IgnoreCase')
  if ($Quoted.Success) { return $Quoted.Groups[1].Value }
  $Unquoted = [regex]::Match($Text, '([A-Za-z]:\\\\[^,"]+\\.(?:exe|lnk|appref-ms))', 'IgnoreCase')
  if ($Unquoted.Success) { return $Unquoted.Groups[1].Value.Trim() }
  return $null
}

function Find-ExecutableInDir([string]$Dir, [string]$DisplayName) {
  if ([string]::IsNullOrWhiteSpace($Dir) -or -not (Test-Path $Dir)) { return $null }
  $NameWords = ($DisplayName -replace '[^A-Za-z0-9]+', ' ').Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
  $Files = Get-ChildItem -Path $Dir -File -Filter '*.exe' -ErrorAction SilentlyContinue
  foreach ($File in $Files) {
    $Base = $File.BaseName.ToLowerInvariant()
    if ($Base -match 'unins|setup|install|crash|helper|redist|cleanup|touchup') { continue }
    foreach ($Word in $NameWords) {
      if ($Word.Length -ge 3 -and $Base.Contains($Word.ToLowerInvariant())) { return $File.FullName }
    }
  }
  $Fallback = $Files | Where-Object { $_.BaseName -notmatch 'unins|setup|install|crash|helper|redist|cleanup|touchup' } | Select-Object -First 1
  if ($Fallback) { return $Fallback.FullName }
  return $null
}

$roots = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$out = @()
foreach ($root in $roots) {
  Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $name = [string]$_.DisplayName
      if ([string]::IsNullOrWhiteSpace($name)) { return }
      $exe = Get-ExecutablePath ([string]$_.DisplayIcon)
      if (-not $exe) { $exe = Find-ExecutableInDir ([string]$_.InstallLocation) $name }
      if ($exe -and (Test-Path $exe)) {
        $out += [PSCustomObject]@{ name = $name; exePath = $exe; source = 'windows' }
      }
    } catch {}
  }
}
if ($out.Count -gt 0) { $out | ConvertTo-Json -Compress -Depth 3 } else { 'null' }
`;
    const raw = this.runPowerShell(ps, 10000);
    return this.parsePowerShellAppResults(raw, 'windows')
      .filter((item) => this.matchesQuery(item.name, query, item.exePath));
  }

  private searchSteam(query: string): AppSearchResult[] {
    const defaultLib = 'C:\\Program Files (x86)\\Steam\\steamapps';
    const libraryPaths = new Set<string>([defaultLib]);

    const vdfCandidates = [
      path.join(defaultLib, 'libraryfolders.vdf'),
      path.join(homedir(), 'AppData', 'Local', 'Steam', 'steamapps', 'libraryfolders.vdf'),
    ];
    for (const vdfPath of vdfCandidates) {
      if (!fs.existsSync(vdfPath)) continue;
      const content = fs.readFileSync(vdfPath, 'utf-8');
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
        libraryPaths.add(path.join(match[1], 'steamapps'));
      }
    }

    const results: AppSearchResult[] = [];
    for (const libPath of libraryPaths) {
      if (!fs.existsSync(libPath)) continue;
      const manifests = fs
        .readdirSync(libPath)
        .filter((f) => /^appmanifest_\d+\.acf$/.test(f));
      for (const manifest of manifests) {
        try {
          const content = fs.readFileSync(path.join(libPath, manifest), 'utf-8');
          const nameMatch = content.match(/"name"\s+"([^"]+)"/);
          const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
          if (!nameMatch || !appIdMatch) continue;
          const name = nameMatch[1];
          if (!this.matchesQuery(name, query)) continue;
          results.push({
            name,
            exePath: `steam://rungameid/${appIdMatch[1]}`,
            source: 'steam',
          });
        } catch { /* skip malformed acf */ }
      }
    }
    return results;
  }

  private searchEpic(query: string): AppSearchResult[] {
    const manifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    if (!fs.existsSync(manifestDir)) return [];

    const results: AppSearchResult[] = [];
    const files = fs.readdirSync(manifestDir).filter((f) => f.endsWith('.item'));
    for (const file of files) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf-8'));
        const name: string = manifest.DisplayName ?? '';
        if (!this.matchesQuery(name, query, manifest.InstallLocation ?? '')) continue;
        const exePath = path.join(
          manifest.InstallLocation ?? '',
          manifest.LaunchExecutable ?? '',
        );
        if (!fs.existsSync(exePath)) continue;
        results.push({ name, exePath, source: 'epic' });
      } catch { /* skip malformed .item */ }
    }
    return results;
  }

  private searchKnownInstallDirs(query: string): AppSearchResult[] {
    const roots = this.getKnownInstallRoots();
    const results: AppSearchResult[] = [];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      results.push(...this.searchExecutableTree(root, query));
    }

    return results;
  }

  async validatePath(
    exePath: string,
  ): Promise<{ valid: boolean; label?: string; iconBase64?: string; error?: string }> {
    if (!fs.existsSync(exePath)) return { valid: false, error: 'File not found' };
    const ext = path.extname(exePath).toLowerCase();
    if (!this.isSupportedLaunchTarget(ext)) {
      return { valid: false, error: 'Not an executable or shortcut file' };
    }
    const label = path.basename(exePath, ext);
    let iconBase64: string | undefined;
    try {
      iconBase64 = this.extractIcon(exePath);
    } catch { /* icon is optional */ }
    return { valid: true, label, iconBase64 };
  }

  extractIcon(exePath: string): string {
    const safePath = exePath.replace(/'/g, "''");
    const ps = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${safePath}')
$bmp = $icon.ToBitmap()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())
`;
    return this.runPowerShell(ps, 5000);
  }

  private isSupportedLaunchTarget(ext: string): boolean {
    return ext === '.exe' || ext === '.lnk' || ext === '.url' || ext === '.appref-ms';
  }

  private withIcons(results: AppSearchResult[]): AppSearchResult[] {
    return results.map((result) => {
      if (result.iconBase64 || this.isProtocolTarget(result.exePath)) return result;
      const ext = path.extname(result.exePath).toLowerCase();
      if (!this.isSupportedLaunchTarget(ext) || !fs.existsSync(result.exePath)) return result;

      let iconBase64 = this.iconCache.get(result.exePath);
      if (!this.iconCache.has(result.exePath)) {
        try {
          iconBase64 = this.extractIcon(result.exePath);
        } catch {
          iconBase64 = undefined;
        }
        this.iconCache.set(result.exePath, iconBase64);
      }

      return iconBase64 ? { ...result, iconBase64 } : result;
    });
  }

  private isProtocolTarget(target: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
  }

  private parsePowerShellAppResults(
    raw: string,
    fallbackSource: AppSearchResult['source'],
  ): AppSearchResult[] {
    if (!raw || raw === 'null') return [];
    const items = JSON.parse(raw) as PowerShellAppResult | PowerShellAppResult[];
    const arr = Array.isArray(items) ? items : [items];
    return arr
      .filter((item): item is Required<Pick<PowerShellAppResult, 'name' | 'exePath'>> & PowerShellAppResult => {
        return typeof item.name === 'string' && typeof item.exePath === 'string';
      })
      .map((item) => ({
        name: item.name.trim(),
        exePath: item.exePath.trim(),
        source: this.toSource(item.source, fallbackSource),
      }))
      .filter((item) => item.name.length > 0 && item.exePath.length > 0);
  }

  private toSource(
    source: AppSearchResult['source'] | undefined,
    fallback: AppSearchResult['source'],
  ): AppSearchResult['source'] {
    return source === 'startmenu' ||
      source === 'windows' ||
      source === 'filesystem' ||
      source === 'steam' ||
      source === 'epic'
      ? source
      : fallback;
  }

  private matchesQuery(name: string, query: string, ...extra: string[]): boolean {
    const tokens = query.split(/\s+/).filter(Boolean);
    const haystack = [name, ...extra].join(' ').toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }

  private rankAndDedupeResults(results: AppSearchResult[]): AppSearchResult[] {
    const byName = new Map<string, AppSearchResult>();

    for (const result of results) {
      const key = this.normalizeResultName(result.name);
      const current = byName.get(key);
      if (!current || this.sourceRank(result.source) < this.sourceRank(current.source)) {
        byName.set(key, result);
      }
    }

    return [...byName.values()].sort((a, b) => {
      const bySource = this.sourceRank(a.source) - this.sourceRank(b.source);
      if (bySource !== 0) return bySource;
      return a.name.localeCompare(b.name);
    });
  }

  private normalizeResultName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private sourceRank(source: AppSearchResult['source']): number {
    switch (source) {
      case 'startmenu':
        return 0;
      case 'steam':
      case 'epic':
        return 1;
      case 'windows':
        return 2;
      case 'filesystem':
        return 3;
    }
  }

  private getKnownInstallRoots(): string[] {
    const roots = new Set<string>();
    for (let code = 67; code <= 90; code += 1) {
      const drive = String.fromCharCode(code);
      roots.add(`${drive}:\\Riot Games`);
      roots.add(`${drive}:\\EA Games`);
      roots.add(`${drive}:\\Origin Games`);
      roots.add(`${drive}:\\Program Files\\Riot Games`);
      roots.add(`${drive}:\\Program Files\\EA Games`);
      roots.add(`${drive}:\\Program Files (x86)\\Origin Games`);
    }
    return [...roots];
  }

  private searchExecutableTree(root: string, query: string): AppSearchResult[] {
    const results: AppSearchResult[] = [];
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let visited = 0;

    while (stack.length > 0 && visited < 1500) {
      const current = stack.pop();
      if (!current) break;
      visited += 1;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (current.depth < 4 && !this.shouldSkipDir(entry.name)) {
            stack.push({ dir: fullPath, depth: current.depth + 1 });
          }
          continue;
        }

        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.exe')) continue;
        if (!this.isLikelyLauncherExe(entry.name)) continue;

        const label = this.labelForExe(fullPath);
        if (!this.matchesQuery(label, query, fullPath)) continue;
        results.push({ name: label, exePath: fullPath, source: 'filesystem' });
      }
    }

    return results;
  }

  private shouldSkipDir(name: string): boolean {
    return /^(__installer|installer|redist|support|directx|vc|eac|easyanticheat|engine|binaries)$/i.test(name);
  }

  private isLikelyLauncherExe(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower.includes('riotclientservices')) return true;
    return !/(crash|installer|unins|uninstall|cleanup|touchup|helper|redist|vcredist|anticheat|shipping)/i.test(lower);
  }

  private labelForExe(exePath: string): string {
    const base = path.basename(exePath, '.exe');
    if (/riot\s*client|riotclient/i.test(base)) return 'Riot Client';
    if (/valorant/i.test(base)) return 'VALORANT';

    const parts = exePath.split(/[\\/]+/).filter(Boolean);
    const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (parent && !/^(live|win64|x64|bin|binaries)$/i.test(parent)) return parent;

    return base.replace(/[-_]+/g, ' ');
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
