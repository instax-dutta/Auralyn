import { Events } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.logger.info(`Ready as ${client.user.tag}`);
    client.logger.info(`Serving ${client.guilds.cache.size} servers`);
    
    client.user.setActivity({
      name: '/play | cinematic music',
      type: 0,
    });
  },
};
