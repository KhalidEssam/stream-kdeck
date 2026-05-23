import { classifyRisk, RiskLevel } from './risk-policy';

describe('classifyRisk', () => {
  const cases: Array<[string, RiskLevel]> = [
    ['git status',                    'safe_read'],
    ['git log --oneline',             'safe_read'],
    ['cat README.md',                 'safe_read'],
    ['ls -la',                        'safe_read'],
    ['git push origin main',          'destructive'],
    ['git push --force',              'destructive'],
    ['rm -rf node_modules',           'destructive'],
    ['npm publish',                   'destructive'],
    ['pnpm publish',                  'destructive'],
    ['curl -X POST https://api.io',   'external_side_effect'],
    ['ssh user@server ls',            'external_side_effect'],
    ['echo hello > out.txt',          'file_write'],
    ['tee output.log',                'file_write'],
    ['git diff HEAD',                 'safe_read'],
  ];

  it.each(cases)('classifies "%s" as %s', (command, expected) => {
    expect(classifyRisk(command)).toBe(expected);
  });
});
