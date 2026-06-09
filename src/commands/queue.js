import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildQueueReply } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View or manage the music queue')
    .addSubcommand(sub =>
      sub.setName('view').setDescription('Show the current queue'))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a track from the queue')
        .addIntegerOption(o =>
          o.setName('position').setDescription('Queue position to remove').setMinValue(1).setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('move')
        .setDescription('Move a track to a new position')
        .addIntegerOption(o =>
          o.setName('from').setDescription('Current position').setMinValue(1).setRequired(true))
        .addIntegerOption(o =>
          o.setName('to').setDescription('Target position').setMinValue(1).setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('clear').setDescription('Clear all upcoming tracks'))
    .addSubcommand(sub =>
      sub.setName('cleanup')
        .setDescription('Remove tracks by criteria')
        .addStringOption(o =>
          o.setName('kind')
            .setDescription('What to remove')
            .setRequired(true)
            .addChoices(
              { name: 'Absent members', value: 'absent' },
              { name: 'Duplicates', value: 'duplicates' },
            ))),

  async execute(interaction, client) {
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'view' || !sub) {
      return interaction.editReply(buildQueueReply(client, guildId));
    }

    if (sub === 'remove') {
      const position = interaction.options.getInteger('position');
      const state = client.musicPlayer.getPlayerState(guildId);
      if ((state.queue ?? []).length === 0) {
        return interaction.editReply(buildActionFeedback('Queue Empty', 'There are no tracks to remove.', false));
      }
      const track = client.musicPlayer.queueManager.remove(guildId, position);
      if (!track) {
        return interaction.editReply(buildActionFeedback('Invalid Position', `Position \`${position}\` is out of range.`, false));
      }
      return interaction.editReply(buildActionFeedback(
        'Track Removed',
        `Removed **${track.info?.title ?? 'Unknown'}** from position ${position}. Use \`/queue\` to see the updated queue.`,
      ));
    }

    if (sub === 'move') {
      const from = interaction.options.getInteger('from');
      const to = interaction.options.getInteger('to');
      if (from === to) {
        return interaction.editReply(buildActionFeedback('Same Position', 'The track is already at that position.', false));
      }
      const track = client.musicPlayer.queueManager.move(guildId, from, to);
      if (!track) {
        const qLen = (client.musicPlayer.getPlayerState(guildId).queue ?? []).length;
        return interaction.editReply(buildActionFeedback('Invalid Position', `Queue has **${qLen}** track${qLen === 1 ? '' : 's'}.`, false));
      }
      return interaction.editReply(buildActionFeedback(
        'Track Moved',
        `Moved **${track.info?.title ?? 'Unknown'}** from position ${from} to ${to}. Use \`/queue\` to see the updated queue.`,
      ));
    }

    if (sub === 'clear') {
      const state = client.musicPlayer.getPlayerState(guildId);
      const count = (state.queue ?? []).length;
      if (count === 0) {
        return interaction.editReply(buildActionFeedback('Queue Already Empty', 'There are no upcoming tracks.', false));
      }
      await client.musicPlayer.clear(guildId);
      return interaction.editReply(buildActionFeedback('Queue Cleared', `Removed **${count}** upcoming track${count === 1 ? '' : 's'}.`));
    }

    if (sub === 'cleanup') {
      const kind = interaction.options.getString('kind');

      if (kind === 'absent') {
        const botVC = interaction.guild.members.me?.voice?.channel;
        if (!botVC) {
          return interaction.editReply(buildActionFeedback('Not Connected', 'Auralyn is not in a voice channel.', false));
        }
        const presentIds = new Set(botVC.members.filter(m => !m.user.bot).map(m => m.id));
        const removed = client.musicPlayer.queueManager.removeIf(
          guildId,
          t => t.requestedByUserId != null && !presentIds.has(t.requestedByUserId),
        );
        return interaction.editReply(
          removed === 0
            ? buildActionFeedback('Leave Cleanup', 'No tracks to remove — all requesters are present.')
            : buildActionFeedback('Leave Cleanup', `Removed **${removed}** track${removed === 1 ? '' : 's'} from absent members. Use \`/queue\` to see the updated queue.`),
        );
      }

      if (kind === 'duplicates') {
        const seen = new Set();
        const removed = client.musicPlayer.queueManager.removeIf(guildId, t => {
          const key = t.info?.identifier ?? t.info?.uri;
          if (!key) return false;
          if (seen.has(key)) return true;
          seen.add(key);
          return false;
        });
        return interaction.editReply(
          removed === 0
            ? buildActionFeedback('No Duplicates', 'No duplicate tracks found.')
            : buildActionFeedback('Duplicates Removed', `Removed **${removed}** duplicate${removed === 1 ? '' : 's'}. Use \`/queue\` to see the updated queue.`),
        );
      }
    }

    return interaction.editReply(buildQueueReply(client, guildId));
  },
};
