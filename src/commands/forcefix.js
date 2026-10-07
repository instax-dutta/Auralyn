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
      const textChannel = state.textChannel;
      const voiceChannel = state.voiceChannel;

      if (!currentTrack && queueSnapshot.length === 0) {
        return interaction.editReply(buildActionFeedback('Nothing to Fix', 'There is nothing playing or queued.', false));
      }

      let result;
      try {
        result = await client.musicPlayer.restoreSession({
          guildId: interaction.guildId,
          currentTrack,
          queue: queueSnapshot,
          textChannel,
          voiceChannel,
        });
      } catch (error) {
        client.logger.error('Error restoring session in /forcefix', error);
        return interaction.editReply(buildActionFeedback('Failed', 'Auralyn could not reconnect the voice session.', false));
      }

      const count = result.restored;
      if (!result.resumed) {
        return interaction.editReply(buildActionFeedback('Reconnect Failed', `Restored **${count}** track${count === 1 ? '' : 's'} but playback did not resume.`, false));
      }

      return interaction.editReply(buildActionFeedback('Reconnected', `Restored **${count}** track${count === 1 ? '' : 's'} and resumed playback.`));
    } catch (error) {
      client.logger.error('Error in /forcefix', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};