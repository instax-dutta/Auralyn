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

    // A background presence refresh must never hold the process open on its
    // own; only real work should keep the event loop alive.
    const presenceTimer = setInterval(updatePresence, 30 * 60 * 1000);
    presenceTimer.unref?.();

    // Hydrate persisted sessions into logical state. This does not connect to
    // voice: reattaching waits for Lavalink, which happens separately.
    await client.musicPlayer?.restoreSessions?.({ client });
  },
};
