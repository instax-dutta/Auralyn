import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('voicechannelstatus')
    .setDescription('Toggle showing the current track in the voice channel status')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable voice channel status updates')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const enabled = interaction.options.getBoolean('enabled');

      if (enabled === null) {
        const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
        return interaction.editReply(buildActionFeedback('Voice Channel Status', `Voice channel status updates are **${settings.vcStatusEnabled ? 'enabled' : 'disabled'}**.`));
      }

      const settings = await client.musicPlayer.settingsStore.update(interaction.guildId, { vcStatusEnabled: enabled });

      if (!enabled) {
        const voiceChannelId = interaction.guild?.members?.me?.voice?.channelId;
        if (voiceChannelId) {
          try {
            await client.rest.put(`/channels/${voiceChannelId}/voice-status`, { body: { status: '' } });
          } catch { /* ignore — 403 on free tier */ }
        }
      }

      return interaction.editReply(buildActionFeedback('Voice Channel Status', `Voice channel status updates are now **${settings.vcStatusEnabled ? 'enabled' : 'disabled'}**.`));
    } catch (error) {
      client.logger.error('Error in /voicechannelstatus', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
