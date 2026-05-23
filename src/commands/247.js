import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode (bot stays in VC even when alone)')
    .setContexts(InteractionContextType.Guild)
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable 24/7 mode')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();

    try {
      const enabled = interaction.options.getBoolean('enabled');
      client.musicPlayer.set247(interaction.guildId, enabled);

      return interaction.editReply(buildActionFeedback(
        '24/7 Mode',
        enabled ? '24/7 mode enabled. I will stay in the voice channel even when alone.' : '24/7 mode disabled. I will leave after detecting an empty channel.',
        true,
      ));
    } catch (error) {
      client.logger.error('Error in 247 command', error);
      return interaction.editReply(buildActionFeedback('24/7 Mode', 'Failed to update 24/7 mode.', false));
    }
  },
};
