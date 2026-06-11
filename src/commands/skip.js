import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { getCommandRestriction, requireDjOrAdmin } from '../utils/permissions.js';

const VOTESKIP_THRESHOLD = 3;

function hasDjRole(member, config) {
  return Boolean(config?.djRoleId && member.roles.cache.has(config.djRoleId));
}

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track (or multiple tracks)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of tracks to skip (default: 1)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const restriction = await getCommandRestriction(client.musicPlayer.settingsStore, interaction.guildId, 'skip');
    if (restriction?.djOnly) {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);
    }
    if (restriction?.channelId && interaction.channelId !== restriction.channelId) {
      return interaction.editReply(buildActionFeedback('Wrong Channel', `This command is restricted to <#${restriction.channelId}>.`, false));
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before skipping tracks.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to skip.', false));
    }

    const amount = interaction.options.getInteger('amount') ?? 1;

    const humanCount = voiceChannel.members.filter(m => !m.user.bot).size;
    if (humanCount > VOTESKIP_THRESHOLD && !hasDjRole(interaction.member, client.config)) {
      return interaction.editReply(buildActionFeedback(
        'Vote Required',
        `There are **${humanCount}** members in the voice channel. Use \`/voteskip\` to start a vote, or ask a DJ to force skip.`,
        false,
      ));
    }

    try {
      // Drop (amount - 1) upcoming tracks then let skip() advance naturally.
      if (amount > 1) {
        const qState = client.musicPlayer.queueManager.getState(interaction.guildId);
        qState.queue.splice(0, amount - 1);
      }

      const nextTrack = await client.musicPlayer.skip(interaction.guildId);
      const label = amount > 1 ? `Skipped ${amount} Tracks` : 'Track Skipped';
      if (!nextTrack) {
        return interaction.editReply(buildActionFeedback('Skip', `Skipped ${amount} track${amount === 1 ? '' : 's'}. Queue is now empty.`));
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | ${label}`);
    } catch (error) {
      client.logger.error('Error in skip command', error);
      return interaction.editReply(buildActionFeedback('Skip Failed', 'There was an error while trying to skip the track.', false));
    }
  },
};
