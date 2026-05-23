import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track'),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before pausing playback.', false));
    }

    try {
      const paused = await client.musicPlayer.pause(interaction.guildId);
      if (!paused) {
        return interaction.editReply(buildActionFeedback('Pause', 'Nothing is currently playing.', false));
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Playback Paused');
    } catch (error) {
      client.logger.error('Error in pause command', error);
      return interaction.editReply(buildActionFeedback('Pause Failed', 'There was an error while trying to pause the track.', false));
    }
  },
};
