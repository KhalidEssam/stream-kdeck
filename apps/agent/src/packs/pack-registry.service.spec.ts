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
  builtin_id: null, command: null,
};

const COMMAND_RAW_TOOL = {
  id: 'tool-2', pack_id: 'pack-1', kind: 'command', label: 'Git Status',
  prompt: '', output_mode: 'viewer', source: 'clipboard',
  icon: 'terminal', color: null, order: 15, phase: 1,
  builtin_id: null, command: 'git status',
};

const PACK_ROW = {
  id: 'pack-1', slug: 'git', name: 'Git', description: null,
  icon: '🔀', color: '#F05033', order: 1, pack_tools: [],
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
      expect(tool.source).toBe('active_window');
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
});
