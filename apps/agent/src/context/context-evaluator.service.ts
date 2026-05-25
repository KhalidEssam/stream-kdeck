import { Injectable } from '@nestjs/common';

export type ContextDomain =
  | 'gaming'
  | 'software'
  | 'writing'
  | 'learning'
  | 'design'
  | 'social'
  | 'productivity'
  | 'media'
  | 'unknown';

export type ContextCandidateDecision = 'accepted' | 'downgraded' | 'rejected';

const MIN_HITS = 2;

const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  gaming: [
    'game',
    'player',
    'spawn',
    'health',
    'mana',
    'loadout',
    'map',
    'quest',
    'loot',
    'kill',
    'respawn',
    'valorant',
    'steam',
    'agent',
    'weapon',
    'ability',
  ],
  software: [
    'function',
    'class',
    'import',
    'const',
    'error',
    'stack',
    'npm',
    'git',
    'commit',
    'pull',
    'branch',
    'type',
    'interface',
  ],
  writing: ['paragraph', 'sentence', 'story', 'character', 'plot', 'tone', 'draft', 'prose', 'chapter'],
  learning: ['exam', 'quiz', 'lecture', 'notes', 'study', 'topic', 'flashcard', 'course', 'assignment'],
  design: ['color', 'palette', 'font', 'spacing', 'layout', 'component', 'figma', 'ui', 'ux', 'accessibility'],
  social: ['tweet', 'caption', 'hashtag', 'post', 'linkedin', 'audience', 'campaign', 'thread'],
  productivity: ['email', 'meeting', 'task', 'agenda', 'deadline', 'action', 'summary', 'priority'],
  media: ['stream', 'obs', 'scene', 'audio', 'volume', 'broadcast', 'record'],
  unknown: [],
};

const PACK_SLUG_TO_DOMAIN: Record<string, ContextDomain> = {
  gamer: 'gaming',
  engineer: 'software',
  writer: 'writing',
  student: 'learning',
  designer: 'design',
  social: 'social',
  productivity: 'productivity',
};

@Injectable()
export class ContextEvaluatorService {
  evaluate(
    content: string,
    toolDomain: ContextDomain,
  ): { decision: ContextCandidateDecision; reason?: string } {
    if (!content.trim()) {
      return { decision: 'downgraded', reason: 'empty_content' };
    }

    const lower = content.toLowerCase();
    let maxHits = 0;
    let detectedDomain: ContextDomain = 'unknown';

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [ContextDomain, string[]][]) {
      if (domain === 'unknown') continue;
      const hits = keywords.filter((keyword) => lower.includes(keyword)).length;
      if (hits > maxHits) {
        maxHits = hits;
        detectedDomain = domain;
      }
    }

    if (maxHits < MIN_HITS) {
      return { decision: 'downgraded', reason: 'no_domain_signal' };
    }

    if (toolDomain !== 'unknown' && detectedDomain !== toolDomain) {
      return { decision: 'rejected', reason: `domain_mismatch:${detectedDomain}_vs_${toolDomain}` };
    }

    return { decision: 'accepted' };
  }

  domainForPackSlug(slug: string): ContextDomain {
    return PACK_SLUG_TO_DOMAIN[slug] ?? 'unknown';
  }
}
