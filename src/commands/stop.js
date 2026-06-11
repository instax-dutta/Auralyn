import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { getCommandRestriction, requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, 'stop');
    if (restriction?.djOnly) {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
    }
    if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
      return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
    }

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before stopping playback.', false));
    }

    try {
      await client.musicPlayer.stop(interaction.guildId);
      return interaction.editReply(buildActionFeedback('Playback Stopped', 'Queue cleared and voice session closed.'));
    } catch (error) {
      client.logger.error('Error in stop command', error);
      return interaction.editReply(buildActionFeedback('Stop Failed', 'There was an error while trying to stop the music.', false));
    }
  },
};
