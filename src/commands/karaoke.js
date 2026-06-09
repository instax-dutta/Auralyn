import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('karaoke')
    .setDescription('Apply the Karaoke filter (center-channel vocal suppression)'),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before changing the filter.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'Start playing something before applying a filter.', false));
    }

    try {
      const result = await client.musicPlayer.setFilter(interaction.guildId, 'karaoke');
      if (!result.ok) return interaction.editReply(buildActionFeedback('Filter Conflict', result.reason, false));
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Filter — 🎤 Karaoke');
    } catch (error) {
      client.logger.error('Error in karaoke command', error);
      return interaction.editReply(buildActionFeedback('Filter Failed', 'There was an error applying the Karaoke filter.', false));
    }
  },
};
