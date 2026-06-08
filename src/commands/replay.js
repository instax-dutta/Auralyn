import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('replay')
    .setDescription('Restart the current track from the beginning'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to replay.', false));
    }

    if (state.currentTrack?.info?.isStream) {
      return interaction.editReply(buildActionFeedback('Not Seekable', 'Live streams cannot be replayed.', false));
    }

    try {
      await client.musicPlayer.seek(interaction.guildId, 0);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Replaying');
    } catch (error) {
      client.logger.error('Error in replay command', error);
      return interaction.editReply(buildActionFeedback('Replay Failed', 'Could not restart the track.', false));
    }
  },
};
