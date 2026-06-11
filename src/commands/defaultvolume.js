import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('defaultvolume')
    .setDescription('Set the default volume for new sessions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option =>
      option.setName('volume')
        .setDescription('Default volume percentage (0-100)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const volume = interaction.options.getInteger('volume');
      await client.musicPlayer.settingsStore.update(interaction.guildId, { defaultVolume: volume });

      const state = client.musicPlayer.getPlayerState(interaction.guildId);
      if (state.isPlaying) {
        await client.musicPlayer.setVolume(interaction.guildId, volume);
      }

      return interaction.editReply(buildActionFeedback('Default Volume', `Default volume set to **${volume}%**.`));
    } catch (error) {
      client.logger.error('Error in /defaultvolume', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
