export type RiskLevel = 'safe_read' | 'writes_clipboard' | 'external_side_effect' | 'file_write' | 'destructive';

const DESTRUCTIVE: RegExp[] = [
  /\bgit\s+push\b/,
  /\bgit\s+push\s+--force\b/,
  /\brm\s+-[rRf]*f[rRf]*\b/,
  /\bdel\s+\/[sf]/i,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /\byarn\s+publish\b/,
  /\bdropdb\b/,
  /\bdrop\s+table\b/i,
];

const EXTERNAL: RegExp[] = [
  /\bcurl\b[^|]*-X\s+(POST|PUT|DELETE|PATCH)/i,
  /\bwget\b[^|]*--post/i,
  /\bssh\b/,
  /\bscp\b/,
  /\brsync\b[^|]*[^-]-[^-]*[^-]?[^-]?[^-]?e\b/,
];

const FILE_WRITE: RegExp[] = [
  /[^>]>[^>]/,
  /\btee\b/,
];

export function classifyRisk(command: string): RiskLevel {
  if (DESTRUCTIVE.some((p) => p.test(command))) return 'destructive';
  if (EXTERNAL.some((p) => p.test(command))) return 'external_side_effect';
  if (FILE_WRITE.some((p) => p.test(command))) return 'file_write';
  return 'safe_read';
}
