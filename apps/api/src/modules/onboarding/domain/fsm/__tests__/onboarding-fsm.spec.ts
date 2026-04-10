import { OnboardingFsm } from '../onboarding-fsm';
import { OnboardingState } from '../../entities/onboarding-state.entity';
import { createAllSteps } from '../steps';
import {
  StepNotFoundException,
  OnboardingAlreadyCompletedException,
} from '../../exceptions/onboarding.exceptions';

describe('OnboardingFsm', () => {
  let fsm: OnboardingFsm;

  beforeEach(() => {
    fsm = new OnboardingFsm(createAllSteps());
  });

  describe('getPrompt', () => {
    it('should return greeting prompt for new state', () => {
      const state = new OnboardingState({ userId: 'user-1' });
      const output = fsm.getPrompt(state);

      expect(output.text).toContain('Nigar');
      expect(output.options).toBeDefined();
      expect(output.options!.length).toBeGreaterThan(0);
      expect(output.inputType).toBe('button');
    });

    it('should throw when state is completed', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        completedAt: new Date(),
      });

      expect(() => fsm.getPrompt(state)).toThrow(
        OnboardingAlreadyCompletedException,
      );
    });
  });

  describe('process', () => {
    it('should advance from greeting to why_need on "next"', () => {
      const state = new OnboardingState({ userId: 'user-1' });
      const result = fsm.process(state, {
        type: 'callback',
        value: 'next',
      });

      expect(result.completed).toBe(false);
      expect(result.newState.currentStep).toBe('why_need');
      expect(result.newState.completedSteps).toContain('greeting');
    });

    it('should skip carousel steps when user selects "skip" from greeting', () => {
      const state = new OnboardingState({ userId: 'user-1' });
      const result = fsm.process(state, {
        type: 'callback',
        value: 'skip',
      });

      expect(result.newState.currentStep).toBe('ask_gender');
      expect(result.newState.stepData.skippedOnboarding).toBe(true);
    });

    it('should return error output for invalid input', () => {
      const state = new OnboardingState({ userId: 'user-1' });
      const result = fsm.process(state, {
        type: 'text',
        value: 'random text',
      });

      // Should stay on the same step
      expect(result.newState.currentStep).toBe('greeting');
      expect(result.completed).toBe(false);
      expect(result.output.text).toContain('düymələrdən');
    });

    it('should traverse the full carousel flow', () => {
      const state = new OnboardingState({ userId: 'user-1' });
      const callbackNext = { type: 'callback' as const, value: 'next' };

      // Greeting → why_need
      let result = fsm.process(state, callbackNext);
      expect(result.newState.currentStep).toBe('why_need');

      // why_need → what_discuss
      result = fsm.process(result.newState, callbackNext);
      expect(result.newState.currentStep).toBe('what_discuss');

      // what_discuss → methods
      result = fsm.process(result.newState, callbackNext);
      expect(result.newState.currentStep).toBe('methods');

      // methods → credentials
      result = fsm.process(result.newState, callbackNext);
      expect(result.newState.currentStep).toBe('credentials');

      // credentials → heavy_warning
      result = fsm.process(result.newState, callbackNext);
      expect(result.newState.currentStep).toBe('heavy_warning');

      // heavy_warning → privacy_policy
      result = fsm.process(result.newState, callbackNext);
      expect(result.newState.currentStep).toBe('privacy_policy');
    });

    it('should throw for unknown step', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'nonexistent_step',
      });

      expect(() =>
        fsm.process(state, { type: 'callback', value: 'next' }),
      ).toThrow(StepNotFoundException);
    });
  });

  describe('voice demo / format selection', () => {
    it('should save response format from voice_demo step', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'voice_demo',
      });

      const result = fsm.process(state, {
        type: 'callback',
        value: 'voice_and_text',
      });

      expect(result.newState.stepData.responseFormat).toBe('voice_and_text');
      expect(result.newState.currentStep).toBe('ask_gender');
    });

    it('should reject invalid format selection', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'voice_demo',
      });

      const result = fsm.process(state, {
        type: 'callback',
        value: 'invalid_format',
      });

      expect(result.newState.currentStep).toBe('voice_demo');
      expect(result.output.text).toContain('formatını seçin');
    });
  });

  describe('ask_bio step', () => {
    it('should accept text input and complete onboarding', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_bio',
        stepData: { name: 'Cavidan', gender: 'male', age: 25 },
      });

      const result = fsm.process(state, {
        type: 'text',
        value: 'Stresslə mübarizə aparmaq istəyirəm',
      });

      expect(result.completed).toBe(true);
      expect(result.newState.isCompleted).toBe(true);
      expect(result.newState.stepData.bio).toBe(
        'Stresslə mübarizə aparmaq istəyirəm',
      );
      expect(result.output.text).toContain('Tanışlıq tamamlandı');
      expect(result.output.text).toContain('Cavidan');
    });

    it('should accept skip button and complete onboarding', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_bio',
        stepData: { name: 'Nigar', gender: 'female', age: 30 },
      });

      const result = fsm.process(state, {
        type: 'callback',
        value: 'skip',
      });

      expect(result.completed).toBe(true);
      expect(result.newState.stepData.bio).toBe('');
    });

    it('should reject text longer than 3000 chars', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_bio',
      });

      const result = fsm.process(state, {
        type: 'text',
        value: 'a'.repeat(3001),
      });

      expect(result.completed).toBe(false);
      expect(result.newState.currentStep).toBe('ask_bio');
      expect(result.output.text).toContain('uzundur');
    });

    it('should reject empty text', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_bio',
      });

      const result = fsm.process(state, {
        type: 'text',
        value: '   ',
      });

      expect(result.completed).toBe(false);
      expect(result.output.text).toContain('Boş mesaj');
    });
  });

  describe('ask_age step', () => {
    it('should accept valid age', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_age',
        stepData: { name: 'Test' },
      });

      const result = fsm.process(state, {
        type: 'text',
        value: '25',
      });

      expect(result.newState.stepData.age).toBe(25);
      expect(result.newState.currentStep).toBe('ask_bio');
    });

    it('should reject non-numeric age', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_age',
      });

      const result = fsm.process(state, {
        type: 'text',
        value: 'yirmi beş',
      });

      expect(result.newState.currentStep).toBe('ask_age');
      expect(result.output.text).toContain('düzgün yaş');
    });

    it('should reject age below 10', () => {
      const state = new OnboardingState({
        userId: 'user-1',
        currentStep: 'ask_age',
      });

      const result = fsm.process(state, {
        type: 'text',
        value: '5',
      });

      expect(result.newState.currentStep).toBe('ask_age');
    });
  });

  describe('full flow end-to-end', () => {
    it('should complete entire onboarding via skip path', () => {
      let state = new OnboardingState({ userId: 'user-full' });

      // Skip carousel
      let result = fsm.process(state, { type: 'callback', value: 'skip' });
      expect(result.newState.currentStep).toBe('ask_gender');

      // Gender
      result = fsm.process(result.newState, {
        type: 'callback',
        value: 'male',
      });
      expect(result.newState.currentStep).toBe('ask_name');

      // Name
      result = fsm.process(result.newState, {
        type: 'text',
        value: 'Əli',
      });
      expect(result.newState.currentStep).toBe('ask_age');

      // Age
      result = fsm.process(result.newState, {
        type: 'text',
        value: '28',
      });
      expect(result.newState.currentStep).toBe('ask_bio');

      // Bio
      result = fsm.process(result.newState, {
        type: 'callback',
        value: 'skip',
      });
      expect(result.completed).toBe(true);
      expect(result.output.text).toContain('Əli');
    });
  });

  describe('getStepIds', () => {
    it('should return all step IDs in order', () => {
      const ids = fsm.getStepIds();
      expect(ids[0]).toBe('greeting');
      expect(ids[ids.length - 1]).toBe('ask_bio');
      expect(ids.length).toBe(13);
    });
  });
});
