import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('restrict')
    .setDescription('Restrict a command to a channel and/or DJs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Command name (without the slash)')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Restrict the command to this channel')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('dj_only')
        .setDescription('Require DJ or admin permissions')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const commandName = interaction.options.getString('command').toLowerCase().replace(/^\//, '');
      const channel = interaction.options.getChannel('channel');
      const djOnly = interaction.options.getBoolean('dj_only');

      if (!client.commands.has(commandName)) {
        return interaction.editReply(buildActionFeedback('Unknown Command', `\`/${commandName}\` does not exist.`, false));
      }

      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const commandRestrictions = { ...(settings.commandRestrictions ?? {}) };
      const existing = commandRestrictions[commandName] ?? {};
      const updated = { ...existing };

      if (channel !== null) updated.channelId = channel.id;
      if (djOnly !== null) updated.djOnly = djOnly;

      commandRestrictions[commandName] = updated;
      await client.musicPlayer.settingsStore.update(interaction.guildId, { commandRestrictions });

      const parts = [];
      if (updated.channelId) parts.push(`channel <#${updated.channelId}>`);
      if (updated.djOnly !== undefined) parts.push(`DJ only: **${updated.djOnly}**`);

      return interaction.editReply(buildActionFeedback('Command Restricted', `\`/${commandName}\` restrictions updated — ${parts.join(', ') || 'no restrictions set'}.`));
    } catch (error) {
      client.logger.error('Error in /restrict', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
