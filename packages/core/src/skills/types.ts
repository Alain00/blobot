/** Content ownership is independent of the website where a skill was discovered. */
export type SkillSource =
  | { readonly kind: 'authored' }
  | { readonly kind: 'local-import'; readonly originalPath?: string }
  | { readonly kind: 'git'; readonly url: string; readonly skillPath: string; readonly requestedRef?: string; readonly resolvedCommit: string };

export type SkillInput =
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'git'; readonly url: string; readonly ref?: string };

export interface SkillMetadata {
  readonly name: string;
  readonly description: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly author?: string;
}

export interface SkillPreviewItem extends SkillMetadata {
  readonly text: string;
  readonly origin?: SkillSource;
  readonly files: readonly string[];
  readonly source: SkillSource;
  readonly hash: string;
}

export interface SkillPreview { readonly id: string; readonly skills: readonly SkillPreviewItem[]; }
export interface PersonalSkill extends SkillMetadata {
  readonly source: SkillSource;
  readonly origin?: SkillSource;
  readonly modified: boolean;
  readonly error?: string;
}
export interface PendingSkill {
  readonly id: string;
  readonly name: string;
  readonly action: 'install' | 'replace' | 'remove';
  readonly error?: string;
}
export interface SkillDraftInput { readonly name: string; readonly description: string; readonly instructions: string; }
export interface SkillDraft { readonly id: string; readonly name: string; }
export interface SkillDetail { readonly text: string; readonly files: readonly string[]; readonly path: string; }
export interface SkillCatalogue { readonly skills: readonly PersonalSkill[]; readonly drafts: readonly SkillDraft[]; readonly pending: readonly PendingSkill[]; readonly executions: number; }
