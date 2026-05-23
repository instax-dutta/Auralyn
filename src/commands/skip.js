import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

const VOTESKIP_THRESHOLD = 3;

function hasDjRole(member, config) {
  return Boolean(config?.djRoleId && member.roles.cache.has(config.djRoleId));
}

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before skipping tracks.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to skip.', false));
    }

    const humanCount = voiceChannel.members.filter(m => !m.user.bot).size;
    if (humanCount > VOTESKIP_THRESHOLD && !hasDjRole(interaction.member, client.config)) {
      return interaction.editReply(buildActionFeedback(
        'Vote Required',
        `There are **${humanCount}** members in the voice channel. Use \`/voteskip\` to start a vote, or ask a DJ to force skip.`,
        false,
      ));
    }

    try {
      const nextTrack = await client.musicPlayer.skip(interaction.guildId);
      if (!nextTrack) {
        return interaction.editReply(buildActionFeedback('Skip', 'There is nothing to skip right now.', false));
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Track Skipped');
    } catch (error) {
      client.logger.error('Error in skip command', error);
      return interaction.editReply(buildActionFeedback('Skip Failed', 'There was an error while trying to skip the track.', false));
    }
  },
};
