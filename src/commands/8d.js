import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('8d')
    .setDescription('Apply the 8D Audio filter (rotating stereo panning)'),

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
      const result = await client.musicPlayer.setFilter(interaction.guildId, '8d');
      if (!result.ok) return interaction.editReply(buildActionFeedback('Filter Conflict', result.reason, false));
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Filter — 🌀 8D Audio');
    } catch (error) {
      client.logger.error('Error in 8d command', error);
      return interaction.editReply(buildActionFeedback('Filter Failed', 'There was an error applying the 8D Audio filter.', false));
    }
  },
};
