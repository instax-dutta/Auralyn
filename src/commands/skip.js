import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before skipping tracks.', false)],
        components: [],
      });
    }

    try {
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
