import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leavecleanup')
    .setDescription('Remove queued tracks requested by members who have left the voice channel'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const botVC = interaction.guild.members.me?.voice?.channel;
    if (!botVC) {
      return interaction.editReply(buildActionFeedback('Not Connected', 'Auralyn is not in a voice channel.', false));
    }

    const presentIds = new Set(
      botVC.members.filter(m => !m.user.bot).map(m => m.id),
    );

    const removed = client.musicPlayer.queueManager.removeIf(
      interaction.guildId,
      t => t.requestedByUserId != null && !presentIds.has(t.requestedByUserId),
    );

    if (removed === 0) {
      return interaction.editReply(buildActionFeedback('Leave Cleanup', 'No tracks to remove — all requesters are still in the channel.'));
    }

    return interaction.editReply(buildActionFeedback(
      'Leave Cleanup',
      `Removed **${removed}** track${removed === 1 ? '' : 's'} from absent members. Use \`/queue\` to see the updated queue.`,
    ));
  },
};
