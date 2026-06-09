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
      // identifier = video ID (most stable); uri fallback for non-YouTube; skip if neither
      const key = t.info?.identifier ?? t.info?.uri;
      if (!key) return false;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

    if (removed === 0) {
      return interaction.editReply(buildActionFeedback('No Duplicates', 'No duplicate tracks found in the queue.'));
    }

    return interaction.editReply(buildActionFeedback(
      'Duplicates Removed',
      `Removed **${removed}** duplicate${removed === 1 ? '' : 's'}. Use \`/queue\` to see the updated queue.`,
    ));
  },
};
