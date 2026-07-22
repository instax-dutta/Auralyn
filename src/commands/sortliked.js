import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sortliked')
    .setDescription('Sort your liked songs')
    .addStringOption(option =>
      option.setName('by')
        .setDescription('Sort by')
        .setRequired(true)
        .addChoices(
          { name: 'Title (A-Z)', value: 'title' },
          { name: 'Duration (shortest first)', value: 'duration' },
          { name: 'Date Added (newest first)', value: 'date_added' },
        )),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const by = interaction.options.getString('by');
      await client.likedStore.sortLikedSongs(interaction.user.id, by);

      const labels = { title: 'Title', duration: 'Duration', date_added: 'Date Added' };
      return interaction.editReply(buildActionFeedback('Liked Songs Sorted', `Sorted by **${labels[by]}**.`));
    } catch (error) {
      client.logger.error('Error in /sortliked', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
