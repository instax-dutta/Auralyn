import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the upcoming queue without stopping the current track'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing right now.', false));
    }

    if (state.queue.length === 0) {
      return interaction.editReply(buildActionFeedback('Queue Already Empty', 'There are no upcoming tracks to clear.', false));
    }

    const count = state.queue.length;
    client.musicPlayer.clear(interaction.guildId);

    return interaction.editReply(buildActionFeedback(
      'Queue Cleared',
      `Removed **${count}** upcoming track${count === 1 ? '' : 's'}. Current track will keep playing.`,
    ));
  },
};
