import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setdj')
    .setDescription('Add a role to the DJ list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to grant DJ permissions')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const role = interaction.options.getRole('role');
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djRoleIds = new Set(settings.djRoleIds ?? []);
      if (djRoleIds.has(role.id)) {
        return interaction.editReply(buildActionFeedback('DJ Role', `${role} is already a DJ role.`, false));
      }
      djRoleIds.add(role.id);
      await client.musicPlayer.settingsStore.update(interaction.guildId, { djRoleIds: [...djRoleIds] });
      return interaction.editReply(buildActionFeedback('DJ Role Added', `${role} can now use DJ-only commands.`));
    } catch (error) {
      client.logger.error('Error in /setdj', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
