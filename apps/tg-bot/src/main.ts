import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', (ctx) =>
  ctx.reply('Salam! Mən Nigar — sənin AI psixoloqunam. 🧠'),
);

bot.on('message:text', (ctx) =>
  ctx.reply('Mesajınız qəbul olundu. Tezliklə tam funksionallıq aktiv olacaq.'),
);

// Long-polling for development
bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Nigar TG Bot started as @${botInfo.username}`);
  },
});
