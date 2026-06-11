import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unsetdj')
    .setDescription('Remove a role from the DJ list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to revoke DJ permissions from')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const role = interaction.options.getRole('role');
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djRoleIds = settings.djRoleIds ?? [];
      if (!djRoleIds.includes(role.id)) {
        return interaction.editReply(buildActionFeedback('DJ Role', `${role} is not a DJ role.`, false));
      }
      await client.musicPlayer.settingsStore.update(interaction.guildId, {
        djRoleIds: djRoleIds.filter((id) => id !== role.id),
      });
      return interaction.editReply(buildActionFeedback('DJ Role Removed', `${role} no longer has DJ permissions.`));
    } catch (error) {
      client.logger.error('Error in /unsetdj', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
