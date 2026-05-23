import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the current track'),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before resuming playback.', false));
    }

    try {
      const resumed = await client.musicPlayer.resume(interaction.guildId);
      if (!resumed) {
        return interaction.editReply(buildActionFeedback('Resume', 'Nothing is currently paused.', false));
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Playback Resumed');
    } catch (error) {
      client.logger.error('Error in resume command', error);
      return interaction.editReply(buildActionFeedback('Resume Failed', 'There was an error while trying to resume the track.', false));
    }
  },
};
