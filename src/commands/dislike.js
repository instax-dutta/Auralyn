import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dislike')
    .setDescription('Remove the current track from your liked songs'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const state = client.musicPlayer.getPlayerState(interaction.guildId);
      if (!state.currentTrack) {
        return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to dislike.', false));
      }

      const uri = state.currentTrack.info?.uri;
      if (!uri) {
        return interaction.editReply(buildActionFeedback('Cannot Dislike', 'This track has no URI.', false));
      }

      const removed = await client.likedStore.unlikeTrack(interaction.user.id, uri);
      if (!removed) {
        return interaction.editReply(buildActionFeedback('Not Liked', 'This track is not in your liked songs.', false));
      }

      return interaction.editReply(buildActionFeedback('Disliked', `Removed **${state.currentTrack.info?.title ?? 'Unknown'}** from your liked songs.`));
    } catch (error) {
      client.logger.error('Error in /dislike', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
