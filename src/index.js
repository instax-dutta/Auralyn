import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

console.log('Starting Auralyn bot...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const player = new Player(client, {
  connectionOptions: {
    shoukaku: {
      nodes: [{
        name: 'main',
        url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
        auth: process.env.LAVALINK_PASSWORD,
        secure: process.env.LAVALINK_SECURE === 'true',
      }],
      options: {
        resumable: true,
        resumableTimeout: 30,
      }
    }
  },
  leaveOnEnd: true,
  leaveOnStop: true,
  leaveOnEmpty: true,
  leaveOnEmptyCooldown: 60000,
});

async function main() {
  await player.extractors.loadMulti(DefaultExtractors);

  client.commands = new Collection();

  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = (await import(`file://${filePath}`)).default;
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }

  const eventsPath = path.join(process.cwd(), 'src', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = (await import(`file://${filePath}`)).default;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  await client.login(process.env.DISCORD_TOKEN);
  console.log('Auralyn bot started successfully!');
}

main().catch(console.error);

export { client, player };