import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildQueueReply } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removedupes')
    .setDescription('Remove duplicate tracks from the queue, keeping the first occurrence'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if ((state.queue ?? []).length === 0) {
      return interaction.editReply(buildActionFeedback('Queue Empty', 'There are no tracks in the queue.', false));
    }

    const seen = new Set();
    const removed = client.musicPlayer.queueManager.removeIf(interaction.guildId, t => {
      const uri = t.info?.uri ?? t.encoded;
      if (seen.has(uri)) return true;
      seen.add(uri);
      return false;
    });

    if (removed === 0) {
      return interaction.editReply(buildActionFeedback('No Duplicates', 'No duplicate tracks found in the queue.'));
    }

    return interaction.editReply({
      ...buildQueueReply(client, interaction.guildId),
      content: `Removed **${removed}** duplicate${removed === 1 ? '' : 's'}.`,
    });
  },
};
