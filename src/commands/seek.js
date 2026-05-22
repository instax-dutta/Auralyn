import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a specific position in the current track')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Target position in seconds')
        .setRequired(true)
        .setMinValue(0)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before seeking.', false)],
        components: [],
      });
    }

    try {
      const position = interaction.options.getInteger('position');
      const player = client.musicPlayer.getState(interaction.guildId).lavalinkPlayer;

      if (!player) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Session', 'There is no active playback session.', false)],
          components: [],
        });
      }

      const currentTrack = client.musicPlayer.getCurrentTrack(interaction.guildId);
      if (!currentTrack) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Track', 'Nothing is currently playing.', false)],
          components: [],
        });
      }

      const trackLength = currentTrack.info?.length ?? 0;
      const seekMs = position * 1000;

      if (seekMs > trackLength) {
        return interaction.editReply({
          embeds: [buildActionFeedback('Invalid Position', `The track is only ${Math.floor(trackLength / 1000)} seconds long.`, false)],
          components: [],
        });
      }

      await player.seekTo(seekMs);

      const formatTime = (totalSeconds) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
      };

      return interaction.editReply({
        embeds: [buildActionFeedback(
          'Seeked',
          `Jumped to **${formatTime(position)}** / ${formatTime(Math.floor(trackLength / 1000))}.`,
        )],
        components: [],
      });
    } catch (error) {
      client.logger.error('Error in seek command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Seek Failed', 'There was an error while seeking.', false)],
        components: [],
      });
    }
  },
};
