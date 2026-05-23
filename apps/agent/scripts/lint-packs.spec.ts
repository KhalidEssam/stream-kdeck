import { lintPacks, RawPack } from './lint-packs';

function makePack(overrides: Partial<RawPack> = {}): RawPack {
  return {
    id: 'pack-1',
    slug: 'test-pack',
    name: 'Test Pack',
    description: 'A test pack',
    icon: 'icon',
    color: null,
    order: 1,
    category: 'developer',
    pack_tools: [],
    ...overrides,
  };
}

function makeAiTool(overrides: Partial<RawPack['pack_tools'][0]> = {}): RawPack['pack_tools'][0] {
  return {
    id: 'tool-1',
    pack_id: 'pack-1',
    kind: 'ai',
    label: 'My AI Tool',
    prompt: 'Do something',
    output_mode: 'clipboard',
    source: 'clipboard',
    icon: 'icon',
    color: null,
    order: 1,
    phase: 1,
    builtin_id: null,
    command: null,
    context_requirements: [{ provider: 'clipboard', required: true, reason: 'needs clipboard' }],
    ...overrides,
  };
}

function makeCommandTool(overrides: Partial<RawPack['pack_tools'][0]> = {}): RawPack['pack_tools'][0] {
  return {
    id: 'tool-2',
    pack_id: 'pack-1',
    kind: 'command',
    label: 'My Command',
    prompt: '',
    output_mode: 'viewer',
    source: 'clipboard',
    icon: 'icon',
    color: null,
    order: 2,
    phase: 1,
    builtin_id: null,
    command: 'echo hello',
    context_requirements: null,
    ...overrides,
  };
}

describe('lintPacks', () => {
  it('returns 0 issues for a fully valid pack with AI tool that has contextRequirements', () => {
    const packs = [makePack({ pack_tools: [makeAiTool()] })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(0);
  });

  it('returns 1 error when pack has null category', () => {
    const packs = [makePack({ category: null })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toMatch(/category/i);
  });

  it('returns 1 error when pack has an unrecognised category value', () => {
    const packs = [makePack({ category: 'gaming' as any })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('returns 1 error when pack has empty description', () => {
    const packs = [makePack({ description: '' })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toMatch(/description/i);
  });

  it('returns 1 error when pack has whitespace-only description', () => {
    const packs = [makePack({ description: '   ' })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('returns 1 error when pack has null description', () => {
    const packs = [makePack({ description: null })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('returns 1 warning when AI tool has null contextRequirements', () => {
    const packs = [makePack({ pack_tools: [makeAiTool({ context_requirements: null })] })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toMatch(/contextRequirements/i);
    expect(issues[0].toolLabel).toBe('My AI Tool');
  });

  it('returns 1 warning when AI tool has empty contextRequirements array', () => {
    const packs = [makePack({ pack_tools: [makeAiTool({ context_requirements: [] })] })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warn');
  });

  it('returns 0 issues for command tool with no contextRequirements', () => {
    const packs = [makePack({ pack_tools: [makeCommandTool({ context_requirements: null })] })];
    const issues = lintPacks(packs);
    expect(issues).toHaveLength(0);
  });

  it('reports all issues when a single pack has multiple problems', () => {
    const packs = [
      makePack({
        category: null,
        description: '',
        pack_tools: [makeAiTool({ context_requirements: [] })],
      }),
    ];
    const issues = lintPacks(packs);
    const errors = issues.filter(i => i.severity === 'error');
    const warns = issues.filter(i => i.severity === 'warn');
    expect(errors).toHaveLength(2);
    expect(warns).toHaveLength(1);
  });

  it('attaches correct packId and packName to issues', () => {
    const packs = [makePack({ id: 'abc', name: 'My Pack', category: null })];
    const issues = lintPacks(packs);
    expect(issues[0].packId).toBe('abc');
    expect(issues[0].packName).toBe('My Pack');
  });

  it('attaches toolId and toolLabel to tool-level issues', () => {
    const tool = makeAiTool({ id: 'tool-xyz', label: 'Summarize', context_requirements: null });
    const packs = [makePack({ pack_tools: [tool] })];
    const issues = lintPacks(packs);
    expect(issues[0].toolId).toBe('tool-xyz');
    expect(issues[0].toolLabel).toBe('Summarize');
  });

  it('accepts all valid PackCategory values without error', () => {
    const validCategories = ['streamer', 'media', 'productivity', 'developer', 'writing', 'learning', 'other'];
    for (const cat of validCategories) {
      const packs = [makePack({ category: cat })];
      const issues = lintPacks(packs);
      const categoryErrors = issues.filter(i => i.message.includes('category'));
      expect(categoryErrors).toHaveLength(0);
    }
  });
});
