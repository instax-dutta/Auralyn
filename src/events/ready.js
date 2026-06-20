import { Events } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.logger.info(`Ready as ${client.user.tag}`);
    client.logger.info(`Serving ${client.guilds.cache.size} servers`);

    const updatePresence = async () => {
      try {
        await client.user.setActivity({
          name: '/play | crystal-clear audio',
          type: 0,
        });
        client.logger.debug('Presence refreshed');
      } catch (error) {
        client.logger.warn('Failed to update presence', error);
      }
    };

    await updatePresence();
    setInterval(updatePresence, 30 * 60 * 1000);
  },
};
