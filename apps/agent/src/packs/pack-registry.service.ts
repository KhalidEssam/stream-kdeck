import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pack, PackTool, PackCategory, ToolContextRequirement } from '@control-surface/shared';
import ws from 'ws';

export const AGENT_CAPABILITY = 1;

interface RawTool {
  id: string;
  pack_id: string;
  kind: string;         // 'ai' (default) | 'command'
  label: string;
  prompt: string;
  output_mode: 'clipboard' | 'autopaste' | 'viewer' | 'silent';
  source: 'clipboard' | 'active_window' | 'shell';
  icon: string;
  color: string | null;
  order: number;
  phase: number;
  builtin_id: string | null;
  command: string | null;   // populated only when kind='command'
  context_requirements: ToolContextRequirement[] | null;
}

interface RawPack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  order: number;
  category: string | null;
  pack_tools: RawTool[];
}

@Injectable()
export class PackRegistryService {
  private readonly supabase: SupabaseClient;
  private packs: Pack[] = [];
  private toolsById = new Map<string, PackTool>();

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_ANON_KEY ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { realtime: { transport: ws as any } },
    );
  }

  async load(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('packs')
        .select('*, pack_tools(*)')
        .lte('pack_tools.phase', AGENT_CAPABILITY);

      if (error || !data) {
        console.warn('[PackRegistry] Failed to load packs:', error?.message);
        return;
      }

      this.toolsById.clear();
      this.packs = (data as RawPack[]).map((raw) => {
        const tools: PackTool[] = (raw.pack_tools ?? [])
          .filter((t) => t.phase <= AGENT_CAPABILITY)
          .sort((a, b) => a.order - b.order)
          .map((t): PackTool => {
            const shared = {
              id: t.id,
              packId: t.pack_id,
              label: t.label,
              icon: t.icon,
              color: t.color ?? undefined,
              order: t.order,
              phase: t.phase,
              builtinId: t.builtin_id ?? undefined,
            };
            if (t.kind === 'command') {
              return {
                ...shared,
                kind: 'command',
                command: t.command ?? '',
                outputMode: t.output_mode === 'silent' ? 'silent' : 'viewer',
                contextRequirements: t.context_requirements ?? undefined,
              };
            }
            return {
              ...shared,
              kind: 'ai',
              prompt: t.prompt,
              outputMode: t.output_mode as 'clipboard' | 'autopaste' | 'viewer',
              source: t.source,
              contextRequirements: t.context_requirements ?? undefined,
            };
          });

        tools.forEach((tool) => this.toolsById.set(tool.id, tool));

        return {
          id: raw.id,
          slug: raw.slug,
          name: raw.name,
          description: raw.description ?? undefined,
          icon: raw.icon,
          color: raw.color ?? undefined,
          order: raw.order,
          category: (raw.category as PackCategory) ?? undefined,
          tools,
        };
      });

      this.packs.sort((a, b) => a.order - b.order);
      console.log(`[PackRegistry] Loaded ${this.packs.length} packs, ${this.toolsById.size} tools`);
    } catch (err) {
      console.warn('[PackRegistry] Unexpected error during load:', err);
    }
  }

  getPacks(): Pack[] {
    return this.packs;
  }

  getById(toolId: string): PackTool | undefined {
    return this.toolsById.get(toolId);
  }
}
