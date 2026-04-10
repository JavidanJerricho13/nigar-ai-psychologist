import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Core API modules (same-process import from monorepo)
import { RedisModule } from '../../api/src/shared/redis/redis.module';
import { PrismaModule } from '../../api/src/shared/prisma/prisma.module';
import { EncryptionModule } from '../../api/src/common/encryption/encryption.module';
import { OnboardingModule } from '../../api/src/modules/onboarding/onboarding.module';
import { UserModule } from '../../api/src/modules/user/user.module';
import { CommandRouterModule } from '../../api/src/modules/command-router/command-router.module';
import { configuration, validationSchema } from '../../api/src/config/configuration';

// Bot-specific
import { BOT_CONFIG, loadBotConfig } from './config/bot.config';
import { BotService } from './adapters/bot.service';
import { CommandHandler } from './handlers/command.handler';
import { MessageHandler } from './handlers/message.handler';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { VoiceHandler } from './handlers/voice.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validationSchema,
    }),
    RedisModule,
    PrismaModule,
    EncryptionModule,
    OnboardingModule,
    UserModule,
    CommandRouterModule,
  ],
  providers: [
    // Bot config
    {
      provide: BOT_CONFIG,
      useFactory: () => loadBotConfig(),
    },

    // Bot core
    BotService,

    // Handlers
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    VoiceHandler,
  ],
  exports: [BotService],
})
export class BotModule implements OnModuleInit {
  private readonly logger = new Logger(BotModule.name);

  constructor(
    private readonly botService: BotService,
    private readonly commandHandler: CommandHandler,
    private readonly messageHandler: MessageHandler,
    private readonly callbackHandler: CallbackQueryHandler,
    private readonly voiceHandler: VoiceHandler,
  ) {}

  onModuleInit(): void {
    // Register all handlers on the bot BEFORE launch
    // Order matters: commands first, then callbacks, then generic text
    this.commandHandler.register();
    this.callbackHandler.register();
    this.voiceHandler.register();
    this.messageHandler.register(); // Must be last (catches all remaining text)

    this.logger.log('All bot handlers registered');
  }
}
