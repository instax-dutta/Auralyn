import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before stopping playback.', false)],
        components: [],
      });
    }

    try {
      await client.musicPlayer.stop(interaction.guildId);
      return interaction.editReply({
        embeds: [buildActionFeedback('Playback Stopped', 'Queue cleared and voice session closed.')],
        components: [],
      });
    } catch (error) {
      client.logger.error('Error in stop command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Stop Failed', 'There was an error while trying to stop the music.', false)],
        components: [],
      });
    }
  },
};
