import { StepDefinition } from '../step.interface';
import { GreetingStep } from './01-greeting.step';
import { WhyNeedStep } from './02-why-need.step';
import { WhatDiscussStep } from './03-what-discuss.step';
import { MethodsStep } from './04-methods.step';
import { CredentialsStep } from './05-credentials.step';
import { HeavyWarningStep } from './06-heavy-warning.step';
import { PrivacyPolicyStep } from './07-privacy-policy.step';
import { SocialProofStep } from './08-social-proof.step';
import { VoiceDemoStep } from './09-voice-demo.step';
import { AskGenderStep } from './10-ask-gender.step';
import { AskNameStep } from './11-ask-name.step';
import { AskAgeStep } from './12-ask-age.step';
import { AskBioStep } from './13-ask-bio.step';

export function createAllSteps(): StepDefinition[] {
  return [
    new GreetingStep(),
    new WhyNeedStep(),
    new WhatDiscussStep(),
    new MethodsStep(),
    new CredentialsStep(),
    new HeavyWarningStep(),
    new PrivacyPolicyStep(),
    new SocialProofStep(),
    new VoiceDemoStep(),
    new AskGenderStep(),
    new AskNameStep(),
    new AskAgeStep(),
    new AskBioStep(),
  ];
}

export {
  GreetingStep,
  WhyNeedStep,
  WhatDiscussStep,
  MethodsStep,
  CredentialsStep,
  HeavyWarningStep,
  PrivacyPolicyStep,
  SocialProofStep,
  VoiceDemoStep,
  AskGenderStep,
  AskNameStep,
  AskAgeStep,
  AskBioStep,
};
