/**
 * Unit tests for carousel steps (01-08).
 * These are button-only educational steps.
 */
import { OnboardingState } from '../../entities/onboarding-state.entity';
import {
  GreetingStep,
  WhyNeedStep,
  WhatDiscussStep,
  MethodsStep,
  CredentialsStep,
  HeavyWarningStep,
  PrivacyPolicyStep,
  SocialProofStep,
} from '../steps';

describe('Carousel Steps', () => {
  // ==================== 01 - Greeting ====================
  describe('GreetingStep', () => {
    const step = new GreetingStep();

    it('has correct id and order', () => {
      expect(step.id).toBe('greeting');
      expect(step.order).toBe(1);
    });

    it('prompt includes Nigar name', () => {
      const state = new OnboardingState({ userId: 'u1' });
      const output = step.prompt(state);
      expect(output.text).toContain('Nigar');
      expect(output.inputType).toBe('button');
      expect(output.options!.length).toBe(2);
    });

    it('validate accepts callback "next"', () => {
      const result = step.validate({ type: 'callback', value: 'next' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(true);
    });

    it('validate accepts callback "skip"', () => {
      const result = step.validate({ type: 'callback', value: 'skip' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(true);
    });

    it('validate accepts command "start"', () => {
      const result = step.validate({ type: 'command', value: 'start' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(true);
    });

    it('validate rejects text input', () => {
      const result = step.validate({ type: 'text', value: 'hello' }, new OnboardingState({ userId: 'u1' }));
      expect(result.valid).toBe(false);
      expect(result.errorOutput).toBeDefined();
    });

    it('extract returns skippedOnboarding=true for skip', () => {
      expect(step.extract({ type: 'callback', value: 'skip' })).toEqual({ skippedOnboarding: true });
    });

    it('extract returns skippedOnboarding=false for next', () => {
      expect(step.extract({ type: 'callback', value: 'next' })).toEqual({ skippedOnboarding: false });
    });

    it('nextStep returns ask_gender when skipped', () => {
      const state = new OnboardingState({ userId: 'u1', stepData: { skippedOnboarding: true } });
      expect(step.nextStep(state)).toBe('ask_gender');
    });

    it('nextStep returns why_need when not skipped', () => {
      const state = new OnboardingState({ userId: 'u1', stepData: { skippedOnboarding: false } });
      expect(step.nextStep(state)).toBe('why_need');
    });
  });

  // ==================== 02 - WhyNeed ====================
  describe('WhyNeedStep', () => {
    const step = new WhyNeedStep();

    it('has correct id and order', () => {
      expect(step.id).toBe('why_need');
      expect(step.order).toBe(2);
    });

    it('prompt returns imageUrl', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.imageUrl).toBeDefined();
      expect(output.options!.length).toBe(2);
    });

    it('validate accepts any callback', () => {
      expect(step.validate({ type: 'callback', value: 'next' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
      expect(step.validate({ type: 'callback', value: 'skip' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects text', () => {
      expect(step.validate({ type: 'text', value: 'hi' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract returns empty object', () => {
      expect(step.extract({ type: 'callback', value: 'next' })).toEqual({});
    });

    it('nextStep always returns what_discuss', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('what_discuss');
    });
  });

  // ==================== 03 - WhatDiscuss ====================
  describe('WhatDiscussStep', () => {
    const step = new WhatDiscussStep();

    it('has correct id=what_discuss, order=3', () => {
      expect(step.id).toBe('what_discuss');
      expect(step.order).toBe(3);
    });

    it('prompt contains topic list', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text.toLowerCase()).toContain('stresslə');
    });

    it('nextStep returns methods', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('methods');
    });
  });

  // ==================== 04 - Methods ====================
  describe('MethodsStep', () => {
    const step = new MethodsStep();

    it('has correct id=methods, order=4', () => {
      expect(step.id).toBe('methods');
      expect(step.order).toBe(4);
    });

    it('prompt mentions KBT', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text).toContain('KBT');
    });

    it('nextStep returns credentials', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('credentials');
    });
  });

  // ==================== 05 - Credentials ====================
  describe('CredentialsStep', () => {
    const step = new CredentialsStep();

    it('has correct id=credentials, order=5', () => {
      expect(step.id).toBe('credentials');
      expect(step.order).toBe(5);
    });

    it('prompt mentions OpenAI, Google, Anthropic', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text).toContain('OpenAI');
      expect(output.text).toContain('Anthropic');
    });

    it('nextStep returns heavy_warning', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('heavy_warning');
    });
  });

  // ==================== 06 - HeavyWarning ====================
  describe('HeavyWarningStep', () => {
    const step = new HeavyWarningStep();

    it('has correct id=heavy_warning, order=6', () => {
      expect(step.id).toBe('heavy_warning');
      expect(step.order).toBe(6);
    });

    it('prompt contains crisis hotline number', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text).toContain('860-510-510');
    });

    it('nextStep returns privacy_policy', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('privacy_policy');
    });
  });

  // ==================== 07 - PrivacyPolicy ====================
  describe('PrivacyPolicyStep', () => {
    const step = new PrivacyPolicyStep();

    it('has correct id=privacy_policy, order=7', () => {
      expect(step.id).toBe('privacy_policy');
      expect(step.order).toBe(7);
    });

    it('prompt has only "accept" button', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.options!.length).toBe(1);
      expect(output.options![0].value).toBe('accept');
    });

    it('validate accepts only "accept" callback', () => {
      expect(step.validate({ type: 'callback', value: 'accept' }, new OnboardingState({ userId: 'u1' })).valid).toBe(true);
    });

    it('validate rejects other callbacks', () => {
      expect(step.validate({ type: 'callback', value: 'decline' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('validate rejects text input', () => {
      expect(step.validate({ type: 'text', value: 'ok' }, new OnboardingState({ userId: 'u1' })).valid).toBe(false);
    });

    it('extract returns privacyAccepted=true', () => {
      expect(step.extract({ type: 'callback', value: 'accept' })).toEqual({ privacyAccepted: true });
    });

    it('nextStep returns social_proof', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('social_proof');
    });
  });

  // ==================== 08 - SocialProof ====================
  describe('SocialProofStep', () => {
    const step = new SocialProofStep();

    it('has correct id=social_proof, order=8', () => {
      expect(step.id).toBe('social_proof');
      expect(step.order).toBe(8);
    });

    it('prompt mentions 60000 users', () => {
      const output = step.prompt(new OnboardingState({ userId: 'u1' }));
      expect(output.text).toContain('60 000');
    });

    it('nextStep returns voice_demo', () => {
      expect(step.nextStep(new OnboardingState({ userId: 'u1' }))).toBe('voice_demo');
    });
  });
});
