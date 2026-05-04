import { Events } from 'discord.js';

export default {
  name: Events.Player,
  async execute(client) {
    client.player.events.on('playerStart', (queue, track) => {
      const channel = queue.metadata.channel;
      if (channel) {
        channel.send(`🎶 Now playing: **${track.title}**`);
      }
    });

    client.player.events.on('queueEnd', (queue) => {
      const channel = queue.metadata.channel;
      if (channel) {
        channel.send('🎵 Queue finished. Leaving voice channel.');
      }
    });

    client.player.events.on('connection', (queue) => {
      const channel = queue.metadata.channel;
      if (channel) {
        channel.send('🔗 Connected to voice channel.');
      }
    });

    client.player.events.on('disconnect', (queue) => {
      const channel = queue.metadata.channel;
      if (channel) {
        channel.send('🔌 Disconnected from voice channel.');
      }
    });
  },
};