import type { DiscoveredSkill, SkillCatalogue, SkillDetail, SkillDraft, SkillDraftInput, SkillInput, SkillPreview } from '@blobot/core/domain';
export type { PersonalSkill, SkillSource, SkillPreview, SkillPreviewItem, SkillDraftInput, SkillDetail } from '@blobot/core/domain';

export interface UiPersonalSkills extends SkillCatalogue {
  readonly supported: boolean;
  readonly sessions: readonly { teamId: string; teamName: string }[];
  readonly history: readonly { id: string; name: string }[];
}
export type SkillAction =
  | { kind: 'open-personal' }
  | { kind: 'install'; previewId: string; names: readonly string[] }
  | { kind: 'replace'; previewId: string; name: string }
  | { kind: 'remove' | 'make-personal' | 'open'; name: string }
  | { kind: 'publish-draft' | 'open-draft' | 'cancel'; id: string }
  | { kind: 'restore'; id: string; name: string };
export interface SkillsApi {
  list(profileId: string): Promise<UiPersonalSkills>;
  chooseFolder(): Promise<string | undefined>;
  preview(profileId: string, input: SkillInput): Promise<SkillPreview>;
  create(profileId: string, input: SkillDraftInput): Promise<SkillDraft>;
  importDraft(profileId: string, path: string): Promise<void>;
  read(profileId: string, name: string): Promise<SkillDetail>;
  check(profileId: string, name: string): Promise<{ changed: boolean; preview: SkillPreview }>;
  act(profileId: string, action: SkillAction): Promise<void>;
  inventory(teamId: string, agentId: string): Promise<{ profileId?: string; supported: boolean; skills: readonly DiscoveredSkill[] }>;
}
