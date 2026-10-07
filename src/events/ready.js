import { Events } from 'discord.js';
import { TimerRegistry } from '../utils/timer-registry.js';

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

    // The presence refresh must never hold the process open on its own, and it
    // must be released on shutdown rather than outliving the client. The
    // registry owns both concerns: it unrefs the timer and lets shutdown
    // dispose everything this handler started.
    const timers = new TimerRegistry();
    client.timerRegistry = timers;
    timers.setInterval(updatePresence, 30 * 60 * 1000);

    // Hydrate persisted sessions into logical state. This does not connect to
    // voice: reattaching waits for Lavalink, which happens separately.
    await client.musicPlayer?.restoreSessions?.({ client });
  },
};
