/**
 * Static registry of all bot commands.
 * Maps command strings to handler keys used by CommandRouterService.
 *
 * Handler keys:
 *   'onboarding' — routed to AdvanceStepUseCase
 *   'stub:xxx'   — placeholder for unimplemented features (returns info message)
 *   'roles'      — role selection
 *   'settings'   — user settings
 *   'info'       — view/edit profile
 *   'balance'    — credits balance
 *   'referral'   — referral info
 */

export interface CommandDefinition {
  /** The command string without "/" */
  command: string;
  /** Handler key for routing */
  handler: string;
  /** Description shown in /other or bot menu */
  description: string;
  /** Whether this command is available during onboarding */
  availableDuringOnboarding: boolean;
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  // Core
  { command: 'start', handler: 'onboarding', description: 'Başla / Yenidən başla', availableDuringOnboarding: true },
  { command: 'roles', handler: 'roles', description: 'Rol seç', availableDuringOnboarding: false },
  { command: 'settings', handler: 'settings', description: 'Parametrlər', availableDuringOnboarding: false },
  { command: 'info', handler: 'info', description: 'Profilə bax / Redaktə et', availableDuringOnboarding: false },
  { command: 'format', handler: 'format', description: 'Cavab formatını dəyiş (səs/mətn)', availableDuringOnboarding: false },

  // Billing & Social
  { command: 'balance', handler: 'balance', description: 'Balans', availableDuringOnboarding: false },
  { command: 'pay', handler: 'stub:pay', description: 'Ödəniş et', availableDuringOnboarding: false },
  { command: 'credits', handler: 'stub:credits', description: 'Kredit tarixçəsi', availableDuringOnboarding: false },
  { command: 'referral', handler: 'referral', description: 'Referal proqramı', availableDuringOnboarding: false },
  { command: 'gift', handler: 'stub:gift', description: 'Hədiyyə göndər', availableDuringOnboarding: false },

  // Content & Features
  { command: 'topics', handler: 'stub:topics', description: 'Mövzu seç', availableDuringOnboarding: false },
  { command: 'image', handler: 'stub:image', description: 'Şəkil generasiya et', availableDuringOnboarding: false },
  { command: 'tales', handler: 'stub:tales', description: 'Nağıllar', availableDuringOnboarding: false },
  { command: 'art', handler: 'stub:art', description: 'Art-terapiya', availableDuringOnboarding: false },
  { command: 'nigar_files', handler: 'stub:nigar_files', description: 'Nigar faylları', availableDuringOnboarding: false },
  { command: 'progress', handler: 'stub:progress', description: 'İrəliləyiş hesabatı', availableDuringOnboarding: false },
  { command: 'clear_chat', handler: 'stub:clear_chat', description: 'Söhbəti təmizlə', availableDuringOnboarding: false },
  { command: 'memory', handler: 'stub:memory', description: 'Nigarın xatirələri', availableDuringOnboarding: false },

  // Meta
  { command: 'support', handler: 'stub:support', description: 'Dəstək', availableDuringOnboarding: true },
  { command: 'about_company', handler: 'stub:about_company', description: 'Şirkət haqqında', availableDuringOnboarding: true },
  { command: 'b2b', handler: 'stub:b2b', description: 'B2B əməkdaşlıq', availableDuringOnboarding: true },
  { command: 'other', handler: 'other', description: 'Digər əmrlər', availableDuringOnboarding: true },
];

/** Quick lookup map: command string → definition */
export const COMMAND_MAP = new Map<string, CommandDefinition>(
  COMMAND_REGISTRY.map((c) => [c.command, c]),
);
