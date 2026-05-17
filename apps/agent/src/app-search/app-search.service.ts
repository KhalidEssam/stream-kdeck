import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { AppSearchResult } from '@control-surface/shared';

@Injectable()
export class AppSearchService {
  async searchApps(query: string): Promise<AppSearchResult[]> {
    const q = query.toLowerCase().trim();
    const results: AppSearchResult[] = [];

    try { results.push(...this.searchStartMenu(q)); } catch { /* skip on error */ }
    try { results.push(...this.searchSteam(q)); } catch { /* skip on error */ }
    try { results.push(...this.searchEpic(q)); } catch { /* skip on error */ }

    return results.slice(0, 30);
  }

  private searchStartMenu(query: string): AppSearchResult[] {
    const ps = `
$shell = New-Object -ComObject WScript.Shell
$paths = @([System.Environment]::GetFolderPath('StartMenu') + '\\Programs', 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs')
$out = @()
foreach ($p in $paths) {
  if (Test-Path $p) {
    Get-ChildItem -Path $p -Recurse -Filter '*.lnk' | ForEach-Object {
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        if ($sc.TargetPath -match '\\.exe$' -and (Test-Path $sc.TargetPath)) {
          $out += [PSCustomObject]@{ name = $_.BaseName; exePath = $sc.TargetPath }
        }
      } catch {}
    }
  }
}
if ($out.Count -gt 0) { $out | ConvertTo-Json -Compress } else { 'null' }
`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15000 })
      .toString()
      .trim();
    if (!raw || raw === 'null') return [];
    const items = JSON.parse(raw);
    const arr: Array<{ name: string; exePath: string }> = Array.isArray(items) ? items : [items];
    return arr
      .filter((item) => item.name.toLowerCase().includes(query))
      .map((item) => ({ name: item.name, exePath: item.exePath, source: 'startmenu' as const }));
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
          if (!name.toLowerCase().includes(query)) continue;
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
        if (!name.toLowerCase().includes(query)) continue;
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

  async validatePath(
    exePath: string,
  ): Promise<{ valid: boolean; label?: string; iconBase64?: string; error?: string }> {
    if (!fs.existsSync(exePath)) return { valid: false, error: 'File not found' };
    if (!exePath.toLowerCase().endsWith('.exe')) {
      return { valid: false, error: 'Not an executable file' };
    }
    const label = path.basename(exePath, '.exe');
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
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    return execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 5000 })
      .toString()
      .trim();
  }
}
