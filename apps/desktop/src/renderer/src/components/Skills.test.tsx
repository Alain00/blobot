/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Skills } from './Skills.js';
import type { SkillsApi, UiPersonalSkills } from '../../../shared/skills.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.innerHTML = ''; });
const catalogue: UiPersonalSkills = { skills: [], drafts: [], pending: [], executions: 0, supported: true, sessions: [], history: [] };
function button(label: string) {
  const found = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function mount(overrides: Partial<SkillsApi> = {}) {
  const api = { list: vi.fn(async () => catalogue), chooseFolder: vi.fn(async () => '/custom'),
    preview: vi.fn(async () => ({ id: 'preview', skills: [{ name: 'research', description: 'Interview customers', text: 'Follow this custom process.', source: { kind: 'local-import' as const }, files: ['SKILL.md', 'scripts/report.sh'], hash: 'hash' }] })),
    act: vi.fn(async () => {}), ...overrides };
  Object.defineProperty(window, 'blobot', { configurable: true, value: { skills: api } });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<Skills profile={{ id: 'ana', name: 'Ana' }} onClose={() => {}} />));
  return api;
}
describe('personal skills surface', () => {
  it('previews a complete custom folder and publishes only on explicit Add to Ana', async () => {
    const api = await mount();
    await click('add skill');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('create');
    await click('from folder');
    expect(document.body.textContent).toContain('scripts/report.sh');
    expect(api.act).not.toHaveBeenCalled();
    await click('add to Ana');
    expect(api.act).toHaveBeenCalledWith('ana', { kind: 'install', previewId: 'preview', names: ['research'] });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('shows pending sessions and keeps cancelled operations independently actionable', async () => {
    const api = await mount({ list: vi.fn(async (): Promise<UiPersonalSkills> => ({ ...catalogue, executions: 2, pending: [{ id: 'op', name: 'research', action: 'install' }], sessions: [{ teamId: 'blue', teamName: 'Blue' }] })) });
    expect(document.body.textContent).toContain('close Ana’s sessions');
    expect(document.body.textContent).toContain('Blue');
    await click('cancel change');
    expect(api.act).toHaveBeenCalledWith('ana', { kind: 'cancel', id: 'op' });
  });
  it('shows runtime limitations without hiding custom skills or creating sessions', async () => {
    await mount({ list: vi.fn(async () => ({ ...catalogue, supported: false, drafts: [{ id: 'draft', name: 'my-process' }] })) });
    expect(document.body.textContent).toContain('does not support personal skills');
    expect(document.body.textContent).toContain('my-process');
    expect(button('make available')).toBeDefined();
  });
  it('keeps a failed preview recoverable in the Add dialog', async () => {
    await mount({ preview: vi.fn(async () => { throw new Error('No SKILL.md found.'); }) });
    await click('add skill'); await click('from folder');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('No SKILL.md');
    expect(button('from folder').disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
