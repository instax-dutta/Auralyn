import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dj')
    .setDescription('Enable or disable DJ mode')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Enable or disable DJ mode')
        .setRequired(true)
        .addChoices(
          { name: 'Enable', value: 'enable' },
          { name: 'Disable', value: 'disable' },
        )),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const mode = interaction.options.getString('mode');
      const enabled = mode === 'enable';
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);

      if (enabled && (!settings.djRoleIds || settings.djRoleIds.length === 0)) {
        await client.musicPlayer.settingsStore.update(interaction.guildId, { djModeEnabled: true });
        return interaction.editReply(buildActionFeedback('DJ Mode Enabled', 'No DJ role set. Use `/setdj` to assign one.', true));
      }

      await client.musicPlayer.settingsStore.update(interaction.guildId, { djModeEnabled: enabled });
      return interaction.editReply(buildActionFeedback('DJ Mode', `DJ mode is now **${enabled ? 'enabled' : 'disabled'}**.`));
    } catch (error) {
      client.logger.error('Error in /dj', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
