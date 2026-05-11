import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { Shoukaku } from 'shoukaku';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MusicPlayer } from './music/player.js';

dotenv.config();

console.log('Starting Auralyn bot...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Shoukaku instance
const shoukaku = new Shoukaku(client, {
  name: 'Auralyn',
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild && guild.shard) {
      guild.shard.send({
        op: 'voiceUpdate',
        d: {
          guildId,
          state: {
            ...guild.voiceStates.get(client.user.id) || {},
            ...payload,
          },
        },
      });
    }
  },
});

// Music player instance
client.musicPlayer = new MusicPlayer(shoukaku);

// Load commands
const loadCommands = async () => {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = (await import(`file://${filePath}`)).default;
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    }
  }
};

// Load events
const loadEvents = async () => {
  const eventsPath = path.join(process.cwd(), 'src', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = (await import(`file://${filePath}`)).default;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client, shoukaku));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client, shoukaku));
    }
  }
};

async function main() {
  // Load commands and events
  await loadCommands();
  await loadEvents();

  // Set up Lavalink node with a name so we can retrieve it later
  shoukaku.initiateConnection({
    nodes: [{
      host: 'localhost',
      port: 2333,
      password: process.env.LAVALINK_PASSWORD,
      secure: false,
      name: 'main'
    }]
  });

  // Login to Discord
  await client.login(process.env.DISCORD_TOKEN);
  console.log('Auralyn bot started successfully!');
}

main().catch(console.error);

// Export for use in tests if needed
export { client, shoukaku };