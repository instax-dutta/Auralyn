import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before skipping tracks.', false)],
        components: [],
      });
    }

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);

      if (settings.voteSkipEnabled && !interaction.member.permissions.has('ManageMessages')) {
        const channel = interaction.member.voice.channel;
        const listeners = channel.members.filter(m => !m.user.bot && m.id !== client.user.id);
        const totalListeners = listeners.size;

        if (totalListeners > 1) {
          const voteSet = client.musicPlayer.getVoteSkipSet(interaction.guildId);
          voteSet.add(interaction.user.id);

          const currentVotes = voteSet.size;
          const needed = Math.max(1, Math.ceil((totalListeners * settings.voteSkipThreshold) / 100));

          if (currentVotes < needed) {
            return interaction.editReply({
              embeds: [buildActionFeedback(
                'Vote Skip',
                `Vote registered (${currentVotes}/${needed}). ${needed - currentVotes} more vote(s) needed to skip.`,
                false,
              )],
              components: [],
            });
          }
        }
      }

      const nextTrack = await client.musicPlayer.skip(interaction.guildId);
      if (!nextTrack) {
        return interaction.editReply({
          embeds: [buildActionFeedback('Skip', 'There is nothing to skip right now.', false)],
          components: [],
        });
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Track Skipped');
    } catch (error) {
      client.logger.error('Error in skip command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Skip Failed', 'There was an error while trying to skip the track.', false)],
        components: [],
      });
    }
  },
};
