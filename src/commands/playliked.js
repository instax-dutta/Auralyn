import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('playliked')
    .setDescription('Play your liked songs')
    .addBooleanOption(option =>
      option.setName('shuffle')
        .setDescription('Shuffle the liked songs')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
      }

      const songs = await client.likedStore.getLikedSongs(interaction.user.id);
      if (songs.length === 0) {
        return interaction.editReply(buildActionFeedback('No Liked Songs', 'You have no liked songs. Use `/like` while playing a track.', false));
      }

      const shuffle = interaction.options.getBoolean('shuffle') ?? false;
      let tracks = songs.map((s) => ({
        encoded: s.encoded,
        info: { title: s.title, uri: s.uri, length: s.duration },
        requestedByUserId: interaction.user.id,
        requestedByName: interaction.user.username,
      }));

      if (shuffle) {
        // Fisher-Yates shuffle
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
      }

      await client.musicPlayer.enqueuePlaylist({
        guildId: interaction.guildId,
        tracks,
        textChannel: interaction.channel,
        voiceChannel,
      });

      return interaction.editReply(buildActionFeedback('Liked Songs', `Queued **${tracks.length}** liked track${tracks.length === 1 ? '' : 's'}${shuffle ? ' (shuffled)' : ''}.`));
    } catch (error) {
      client.logger.error('Error in /playliked', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
