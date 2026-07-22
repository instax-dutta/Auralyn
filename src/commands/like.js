import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('like')
    .setDescription('Add the current track to your liked songs'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const state = client.musicPlayer.getPlayerState(interaction.guildId);
      if (!state.currentTrack) {
        return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to like.', false));
      }

      const added = await client.likedStore.likeTrack(interaction.user.id, state.currentTrack);
      if (!added) {
        return interaction.editReply(buildActionFeedback('Already Liked', 'This track is already in your liked songs.', false));
      }

      return interaction.editReply(buildActionFeedback('Liked', `Added **${state.currentTrack.info?.title ?? 'Unknown'}** to your liked songs.`));
    } catch (error) {
      client.logger.error('Error in /like', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
