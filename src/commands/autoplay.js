import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay (automatically play related tracks when queue ends)')
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable autoplay')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    try {
      const enabled = interaction.options.getBoolean('enabled');
      await client.musicPlayer.setAutoplay(interaction.guildId, enabled);

      return interaction.editReply({
        embeds: [buildActionFeedback(
          'Autoplay',
          enabled ? 'Autoplay enabled. Related tracks will play automatically when the queue ends.' : 'Autoplay disabled.',
        )],
        components: [],
      });
    } catch (error) {
      client.logger.error('Error in autoplay command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Autoplay', 'Failed to update autoplay setting.', false)],
        components: [],
      });
    }
  },
};
