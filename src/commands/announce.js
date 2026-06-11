import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Toggle track announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable announcements')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post announcements in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');

      const update = {};
      if (enabled !== null) update.announceTracks = enabled;
      if (channel) update.announceChannelId = channel.id;

      if (Object.keys(update).length === 0) {
        const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
        return interaction.editReply(buildActionFeedback(
          'Announce',
          `Announcements are **${settings.announceTracks ? 'enabled' : 'disabled'}**${settings.announceChannelId ? ` in <#${settings.announceChannelId}>` : ''}.`,
        ));
      }

      const settings = await client.musicPlayer.settingsStore.update(interaction.guildId, update);

      return interaction.editReply(buildActionFeedback(
        'Announce',
        `Announcements are now **${settings.announceTracks ? 'enabled' : 'disabled'}**${settings.announceChannelId ? ` in <#${settings.announceChannelId}>` : ''}.`,
      ));
    } catch (error) {
      client.logger.error('Error in /announce', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
