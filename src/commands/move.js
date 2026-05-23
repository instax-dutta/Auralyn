import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { trackTitle } from '../utils/tracks.js';

export default {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different position in the queue')
    .addIntegerOption(option =>
      option.setName('from')
        .setDescription('Current position of the track')
        .setMinValue(1)
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('to')
        .setDescription('Position to move it to')
        .setMinValue(1)
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);

    if (!state.isPlaying || state.queue.length === 0) {
      return interaction.editReply(buildActionFeedback('Queue Empty', 'There are no tracks in the queue to move.', false));
    }

    const from = interaction.options.getInteger('from');
    const to = interaction.options.getInteger('to');
    const queueLength = state.queue.length;

    if (from > queueLength) {
      return interaction.editReply(buildActionFeedback('Invalid Position', `Position \`${from}\` is out of range. Queue has \`${queueLength}\` track${queueLength === 1 ? '' : 's'}.`, false));
    }

    if (to > queueLength) {
      return interaction.editReply(buildActionFeedback('Invalid Position', `Position \`${to}\` is out of range. Queue has \`${queueLength}\` track${queueLength === 1 ? '' : 's'}.`, false));
    }

    if (from === to) {
      return interaction.editReply(buildActionFeedback('Same Position', 'The track is already at that position.', false));
    }

    const track = client.musicPlayer.move(interaction.guildId, from, to);

    return interaction.editReply(buildActionFeedback(
      'Queue Updated',
      `Moved **${trackTitle(track)}** from position \`${from}\` to \`${to}\`.`,
    ));
  },
};
