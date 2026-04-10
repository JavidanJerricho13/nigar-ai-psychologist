import { Injectable } from '@nestjs/common';
import { ActiveRole } from '@nigar/shared-types';
import { LlmMessage } from '../../domain/ports/llm-provider.port';
import { SYSTEM_PREAMBLE } from './templates/system-preamble';
import { getPersonaTemplate } from './templates/personas';

export interface UserContext {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  bio?: string | null;
}

export interface PromptBuildInput {
  persona: ActiveRole;
  rudenessEnabled: boolean;
  userContext: UserContext;
  conversationHistory: LlmMessage[];
  currentMessage: string;
}

/**
 * Assembles the final prompt in the order defined in ARCHITECTURE.md:
 * 1. System Preamble (safety rails, AZ language)
 * 2. Persona Base (selected role personality)
 * 3. Persona Modifier (e.g., rudeness toggle for Nigar Black)
 * 4. User Context (age, gender, bio)
 * 5. Conversation History (sliding window)
 * 6. Current User Message (PII-stripped)
 */
@Injectable()
export class PromptBuilderService {
  build(input: PromptBuildInput): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // 1. System message = preamble + persona + modifier + user context
    const systemParts: string[] = [SYSTEM_PREAMBLE];

    // 2. Persona base
    const persona = getPersonaTemplate(input.persona);
    systemParts.push(`\n--- ROL: ${persona.name} ---\n${persona.basePrompt}`);

    // 3. Persona modifier (dynamic)
    if (
      input.persona === ActiveRole.NIGAR_BLACK &&
      input.rudenessEnabled &&
      persona.rudenessModifier
    ) {
      systemParts.push(`\n${persona.rudenessModifier}`);
    }

    // 4. User context
    const ctx = this.buildUserContext(input.userContext);
    if (ctx) {
      systemParts.push(`\n--- İSTİFADƏÇİ PROFİLİ ---\n${ctx}`);
    }

    messages.push({ role: 'system', content: systemParts.join('\n') });

    // 5. Conversation history
    for (const msg of input.conversationHistory) {
      messages.push(msg);
    }

    // 6. Current user message
    messages.push({ role: 'user', content: input.currentMessage });

    return messages;
  }

  private buildUserContext(ctx: UserContext): string | null {
    const parts: string[] = [];

    if (ctx.name) parts.push(`Ad: ${ctx.name}`);
    if (ctx.age) parts.push(`Yaş: ${ctx.age}`);
    if (ctx.gender) {
      const label =
        ctx.gender === 'male' ? 'Kişi' : ctx.gender === 'female' ? 'Qadın' : '';
      if (label) parts.push(`Cins: ${label}`);
    }
    if (ctx.bio) parts.push(`Haqqında: ${ctx.bio}`);

    return parts.length > 0 ? parts.join('\n') : null;
  }
}
