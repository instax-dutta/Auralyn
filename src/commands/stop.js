import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before stopping playback.', false));
    }

    try {
      await client.musicPlayer.stop(interaction.guildId);
      return interaction.editReply(buildActionFeedback('Playback Stopped', 'Queue cleared and voice session closed.'));
    } catch (error) {
      client.logger.error('Error in stop command', error);
      return interaction.editReply(buildActionFeedback('Stop Failed', 'There was an error while trying to stop the music.', false));
    }
  },
};
