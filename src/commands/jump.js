import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { formatDuration } from '../utils/tracks.js';

export default {
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump to a specific position in the queue')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Queue position to jump to (1 = next up)')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing right now.', false));
    }

    const position = interaction.options.getInteger('position');

    if (state.queue.length === 0) {
      return interaction.editReply(buildActionFeedback('Queue Empty', 'There are no upcoming tracks to jump to.', false));
    }

    if (position > state.queue.length) {
      return interaction.editReply(buildActionFeedback(
        'Invalid Position',
        `Position **${position}** is out of range. The queue has **${state.queue.length}** track${state.queue.length === 1 ? '' : 's'}.`,
        false,
      ));
    }

    const targetTrack = state.queue[position - 1];
    const title = targetTrack?.info?.title ?? 'Unknown';
    const uri = targetTrack?.info?.uri ?? '';
    const duration = targetTrack?.info?.length ? formatDuration(targetTrack.info.length) : '?:??';

    await client.musicPlayer.jump(interaction.guildId, position);

    return interaction.editReply(buildActionFeedback(
      'Jumped to Track',
      `Now playing **[${title}](${uri})** \`${duration}\`${position > 1 ? ` — skipped **${position - 1}** track${position - 1 === 1 ? '' : 's'}` : ''}.`,
    ));
  },
};
