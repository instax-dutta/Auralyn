import { Events } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`🤖 Auralyn is ready! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    
    client.user.setActivity({
      name: '/play | 🎵 Your Music Bot',
      type: 0,
    });
  },
};