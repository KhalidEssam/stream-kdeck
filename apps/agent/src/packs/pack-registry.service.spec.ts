const mockSelect = jest.fn();
const mockLte = jest.fn();
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));
jest.mock('ws', () => ({}));

import { PackRegistryService } from './pack-registry.service';

const AI_RAW_TOOL = {
  id: 'tool-1', pack_id: 'pack-1', kind: 'ai', label: 'Write Commit Message',
  prompt: 'Write a commit message for the following diff:', output_mode: 'clipboard',
  source: 'active_window', icon: 'git', color: null, order: 1, phase: 1,
  builtin_id: null, command: null, context_requirements: null,
};

const COMMAND_RAW_TOOL = {
  id: 'tool-2', pack_id: 'pack-1', kind: 'command', label: 'Git Status',
  prompt: '', output_mode: 'viewer', source: 'clipboard',
  icon: 'terminal', color: null, order: 15, phase: 1,
  builtin_id: null, command: 'git status', context_requirements: null,
};

const PACK_ROW = {
  id: 'pack-1', slug: 'git', name: 'Git', description: null,
  icon: '🔀', color: '#F05033', order: 1, category: 'developer', pack_tools: [],
};

describe('PackRegistryService', () => {
  let service: PackRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ lte: mockLte });
    service = new PackRegistryService();
  });

  it('maps an ai tool to PackTool with kind=ai', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [AI_RAW_TOOL] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    const [tool] = pack.tools;
    expect(tool.kind).toBe('ai');
    if (tool.kind === 'ai') {
      expect(tool.prompt).toBe('Write a commit message for the following diff:');
      expect(tool.outputMode).toBe('clipboard');
    }
  });

  it('maps a command tool to PackTool with kind=command', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [COMMAND_RAW_TOOL] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    const [tool] = pack.tools;
    expect(tool.kind).toBe('command');
    if (tool.kind === 'command') {
      expect(tool.command).toBe('git status');
      expect(tool.outputMode).toBe('viewer');
    }
  });

  it('returns empty packs before load', () => {
    expect(service.getPacks()).toEqual([]);
  });

  it('getById returns a command tool after load', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [COMMAND_RAW_TOOL] }],
      error: null,
    });
    await service.load();
    const tool = service.getById('tool-2');
    expect(tool).toBeDefined();
    expect(tool?.kind).toBe('command');
    if (tool?.kind === 'command') {
      expect(tool.command).toBe('git status');
    }
  });

  it('maps category from raw pack row', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    expect(pack.category).toBe('developer');
  });

  it('category is undefined when null in row', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, category: null, pack_tools: [] }],
      error: null,
    });
    await service.load();
    const [pack] = service.getPacks();
    expect(pack.category).toBeUndefined();
  });

  it('maps context_requirements from raw tool', async () => {
    const toolWithRequirements = {
      ...AI_RAW_TOOL,
      context_requirements: [
        { provider: 'git', required: true, reason: 'needs git repo state' },
      ],
    };
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [toolWithRequirements] }],
      error: null,
    });
    await service.load();
    const tool = service.getById('tool-1');
    expect(tool?.contextRequirements).toHaveLength(1);
    expect(tool?.contextRequirements?.[0].provider).toBe('git');
  });

  it('contextRequirements is undefined when null in row', async () => {
    mockLte.mockResolvedValue({
      data: [{ ...PACK_ROW, pack_tools: [{ ...AI_RAW_TOOL, context_requirements: null }] }],
      error: null,
    });
    await service.load();
    const tool = service.getById('tool-1');
    expect(tool?.contextRequirements).toBeUndefined();
  });
});
