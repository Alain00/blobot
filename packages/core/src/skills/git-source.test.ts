import { describe, expect, it } from 'vitest';
import { resolveSkillRepository } from './git-source.js';

describe('skill repository inputs', () => {
  it('resolves a catalog link without requiring its API, preserving the skill name', () => {
    expect(resolveSkillRepository({ kind: 'git', url: 'https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices' }).skill).toBe('vercel-react-best-practices');
    expect(resolveSkillRepository({ kind: 'git', url: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices' })).toEqual({ url: 'https://github.com/vercel-labs/agent-skills.git', skill: 'vercel-react-best-practices' });
    expect(resolveSkillRepository({ kind: 'git', url: 'my-team/custom' }).url).toBe('https://github.com/my-team/custom.git');
  });
  it('accepts generic public Git hosts and explicit branches', () => {
    expect(resolveSkillRepository({ kind: 'git', url: 'https://git.example.org/a/subgroup/custom.git', ref: 'skills/stable' })).toEqual({ url: 'https://git.example.org/a/subgroup/custom.git', ref: 'skills/stable' });
  });
  it.each(['npx skills add owner/repo', 'file:///tmp/skills', 'https://user:secret@git.example.com/repo', 'https://example.com/repo?token=secret', 'ssh://git.example.org/repo', 'https://skills.sh/only-a-page', 'https://github.com/team/repo/tree/main/skills'])('rejects unsupported commands, credentials and ambiguous pages: %s', (url) => {
    expect(() => resolveSkillRepository({ kind: 'git', url })).toThrow();
  });
  it('rejects option injection and non-ref expressions', () => {
    expect(() => resolveSkillRepository({ kind: 'git', url: 'team/repo', ref: '--upload-pack=evil' })).toThrow();
    expect(() => resolveSkillRepository({ kind: 'git', url: 'team/repo', ref: 'HEAD:other' })).toThrow();
  });
});
