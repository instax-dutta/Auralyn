import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { trackArtwork, trackAuthor, trackLength, trackTitle, trackUri } from '../utils/tracks.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const playerState = client.musicPlayer.getPlayerState(interaction.guildId);
    const currentTrack = playerState.currentTrack;

    if (!currentTrack) {
      return interaction.editReply('Nothing is currently playing!');
    }

    const embed = new EmbedBuilder()
      .setColor(0x6B4EFF) // AuralynColors.primary
      .setTitle('Now Playing')
      .setDescription(trackUri(currentTrack) ? `[${trackTitle(currentTrack)}](${trackUri(currentTrack)})` : trackTitle(currentTrack))
      .addFields(
        { name: 'Author', value: trackAuthor(currentTrack), inline: true },
        { name: 'Duration', value: trackLength(currentTrack), inline: true },
        { name: 'Volume', value: `${playerState.volume}%`, inline: true },
        { name: 'Loop', value: ['Off', 'Track', 'Queue'][playerState.loopMode], inline: true }
      )
      .setTimestamp();

    const thumbnail = trackArtwork(currentTrack);
    if (thumbnail) embed.setThumbnail(thumbnail);

    return interaction.editReply({ embeds: [embed] });
  },
};
