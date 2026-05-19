import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the queue while keeping the current track playing'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before clearing the queue.', false)],
        components: [],
      });
    }

    try {
      client.musicPlayer.getQueueManager().clearQueue(interaction.guildId);

      return interaction.editReply({
        embeds: [buildActionFeedback('Queue Cleared', 'All tracks have been removed from the queue. The current track continues playing.')],
        components: [],
      });
    } catch (error) {
      client.logger.error('Error in clear command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Clear Failed', 'There was an error while trying to clear the queue.', false)],
        components: [],
      });
    }
  },
};
