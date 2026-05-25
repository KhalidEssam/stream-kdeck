import { ContextEvaluatorService } from './context-evaluator.service';

describe('ContextEvaluatorService', () => {
  let service: ContextEvaluatorService;

  beforeEach(() => {
    service = new ContextEvaluatorService();
  });

  it('accepts content that matches the tool domain', () => {
    const result = service.evaluate(
      'The player spawned and picked up a loadout near the map objective',
      'gaming',
    );
    expect(result.decision).toBe('accepted');
  });

  it('rejects content that clearly matches a different domain', () => {
    const result = service.evaluate(
      'import { calculateTotal } from "./cart"; const result = calculateTotal(items);',
      'gaming',
    );
    expect(result.decision).toBe('rejected');
    expect(result.reason).toContain('domain_mismatch');
  });

  it('downgrades content with no domain signal', () => {
    const result = service.evaluate('https://example.com/page', 'gaming');
    expect(result.decision).toBe('downgraded');
    expect(result.reason).toBe('no_domain_signal');
  });

  it('downgrades empty content', () => {
    const result = service.evaluate('   ', 'gaming');
    expect(result.decision).toBe('downgraded');
    expect(result.reason).toBe('empty_content');
  });

  it('accepts software content for engineer tools', () => {
    const result = service.evaluate(
      'import { useState } from "react"; const [count, setCount] = useState(0);',
      'software',
    );
    expect(result.decision).toBe('accepted');
  });

  it('downgrades content with fewer than the minimum keyword matches', () => {
    const result = service.evaluate('there was a game', 'gaming');
    expect(result.decision).toBe('downgraded');
  });

  it('returns domain for known pack slugs', () => {
    expect(service.domainForPackSlug('gamer')).toBe('gaming');
    expect(service.domainForPackSlug('engineer')).toBe('software');
    expect(service.domainForPackSlug('unknown-pack')).toBe('unknown');
  });
});
