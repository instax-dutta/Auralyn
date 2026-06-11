import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('forcefix')
    .setDescription('Reconnect the player and restore the queue if playback gets stuck'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);

      const state = client.musicPlayer.getPlayerState(interaction.guildId);
      const queueSnapshot = [...state.queue];
      const currentTrack = state.currentTrack;

      if (!currentTrack && queueSnapshot.length === 0) {
        return interaction.editReply(buildActionFeedback('Nothing to Fix', 'There is nothing playing or queued.', false));
      }

      await client.musicPlayer.stop(interaction.guildId);

      if (currentTrack) {
        client.musicPlayer.enqueueFront(interaction.guildId, currentTrack);
      }
      for (const track of queueSnapshot) {
        client.musicPlayer.enqueueFront(interaction.guildId, track);
      }

      const restored = (currentTrack ? 1 : 0) + queueSnapshot.length;
      return interaction.editReply(buildActionFeedback('Reconnected', `Restored **${restored}** track${restored === 1 ? '' : 's'}.`));
    } catch (error) {
      client.logger.error('Error in /forcefix', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
