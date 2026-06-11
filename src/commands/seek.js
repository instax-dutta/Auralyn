import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { parseTimeInput } from '../utils/formatters.js';
import { getCommandRestriction, requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track')
    .addStringOption(option =>
      option.setName('position')
        .setDescription('Timestamp to seek to — e.g. 1:30 or 90')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, 'seek');
    if (restriction?.djOnly) {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
    }
    if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
      return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);

    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to seek in.', false));
    }

    if (state.currentTrack?.info?.isStream) {
      return interaction.editReply(buildActionFeedback('Not Seekable', 'Live streams cannot be seeked.', false));
    }

    const input = interaction.options.getString('position');
    const positionMs = parseTimeInput(input);

    if (positionMs === null) {
      return interaction.editReply(buildActionFeedback('Invalid Position', 'Use a format like `1:30`, `0:45`, or `90` (seconds).', false));
    }

    try {
      await client.musicPlayer.seek(interaction.guildId, positionMs);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Seeked');
    } catch (error) {
      return interaction.editReply(buildActionFeedback('Seek Failed', error.message, false));
    }
  },
};
