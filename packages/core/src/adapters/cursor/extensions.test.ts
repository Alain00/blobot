import { describe, expect, it } from 'vitest';
import { ASK_QUESTION_METHOD, CREATE_PLAN_METHOD, askQuestionRefusal, createPlanRefusal } from './extensions.js';

describe('Cursor extension replies', () => {
  it('skips a question rather than answering for the user', () => {
    expect(ASK_QUESTION_METHOD).toBe('cursor/ask_question');
    expect(askQuestionRefusal().outcome.outcome).toBe('skipped');
  });

  it('rejects a plan rather than accepting it', () => {
    expect(CREATE_PLAN_METHOD).toBe('cursor/create_plan');
    expect(createPlanRefusal().outcome.outcome).toBe('rejected');
  });
});
