import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const VALID_CATEGORIES = new Set([
  'streamer',
  'media',
  'productivity',
  'developer',
  'writing',
  'learning',
  'other',
]);

export interface RawPackTool {
  id: string;
  pack_id: string;
  kind: string;
  label: string;
  prompt: string;
  output_mode: string;
  source: string;
  icon: string;
  color: string | null;
  order: number;
  phase: number;
  builtin_id: string | null;
  command: string | null;
  context_requirements: Array<{ provider: string; required: boolean; reason: string }> | null;
}

export interface RawPack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  order: number;
  category: string | null;
  pack_tools: RawPackTool[];
}

export interface Issue {
  packId: string;
  packName: string;
  toolId?: string;
  toolLabel?: string;
  severity: 'error' | 'warn';
  message: string;
}

export function lintPacks(packs: RawPack[]): Issue[] {
  const issues: Issue[] = [];

  for (const pack of packs) {
    if (!pack.category || !VALID_CATEGORIES.has(pack.category)) {
      issues.push({
        packId: pack.id,
        packName: pack.name,
        severity: 'error',
        message: `missing or invalid category: ${pack.category ?? 'null'}`,
      });
    }

    if (!pack.description?.trim()) {
      issues.push({
        packId: pack.id,
        packName: pack.name,
        severity: 'error',
        message: 'missing description',
      });
    }

    for (const tool of pack.pack_tools ?? []) {
      if (tool.kind === 'ai' && (!tool.context_requirements || tool.context_requirements.length === 0)) {
        issues.push({
          packId: pack.id,
          packName: pack.name,
          toolId: tool.id,
          toolLabel: tool.label,
          severity: 'warn',
          message: 'AI tool missing contextRequirements',
        });
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('packs')
    .select('*, pack_tools(*)')
    .lte('pack_tools.phase', 1);

  if (error || !data) {
    console.error('Failed to fetch packs:', error?.message);
    process.exit(1);
  }

  const issues = lintPacks(data as RawPack[]);

  // Group issues by pack
  const byPack = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.packId;
    if (!byPack.has(key)) byPack.set(key, []);
    byPack.get(key)!.push(issue);
  }

  for (const [, packIssues] of byPack) {
    const first = packIssues[0];
    console.log(`\nPack "${first.packName}" [${first.packId}]:`);
    for (const issue of packIssues) {
      if (issue.toolLabel) {
        console.log(`  ${issue.severity}: tool "${issue.toolLabel}" — ${issue.message}`);
      } else {
        console.log(`  ${issue.severity}: ${issue.message}`);
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warns = issues.filter(i => i.severity === 'warn').length;
  console.log(`\n${errors} errors, ${warns} warnings`);

  if (errors > 0) process.exit(1);
}

// Only run when invoked directly (not when imported by tests)
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
