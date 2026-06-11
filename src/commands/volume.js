import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { getCommandRestriction, requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the player volume (1-100)')
    .addIntegerOption(option =>
      option.setName('volume')
        .setDescription('The volume percentage')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, 'volume');
    if (restriction?.djOnly) {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
    }
    if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
      return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
    }

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before adjusting volume.', false));
    }

    const volume = interaction.options.getInteger('volume');

    try {
      await client.musicPlayer.setVolume(interaction.guildId, volume);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Volume Updated');
    } catch (error) {
      client.logger.error('Error in volume command', error);
      return interaction.editReply(buildActionFeedback('Volume Update Failed', 'There was an error while trying to set the volume.', false));
    }
  },
};
