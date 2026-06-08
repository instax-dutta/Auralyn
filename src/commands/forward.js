import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Skip forward in the current track')
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Seconds to skip forward (default: 10)')
        .setMinValue(1)
        .setMaxValue(600)
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing.', false));
    }

    if (state.currentTrack?.info?.isStream) {
      return interaction.editReply(buildActionFeedback('Not Seekable', 'Live streams cannot be seeked.', false));
    }

    const seconds = interaction.options.getInteger('seconds') ?? 10;
    const pos = client.musicPlayer.getPosition(interaction.guildId);
    const duration = state.currentTrack?.info?.length ?? 0;
    const newPos = Math.min(pos + seconds * 1000, duration - 1000);

    try {
      await client.musicPlayer.seek(interaction.guildId, newPos);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | Forward ${seconds}s`);
    } catch (error) {
      client.logger.error('Error in forward command', error);
      return interaction.editReply(buildActionFeedback('Forward Failed', 'Could not seek forward.', false));
    }
  },
};
