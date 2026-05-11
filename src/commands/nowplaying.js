import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

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
      .setTitle('🎶 Now Playing')
      .setDescription(`[${currentTrack.title}](${currentTrack.uri || '#'})`)
      .addFields(
        { name: '👤 Author', value: currentTrack.author || 'Unknown', inline: true },
        { name: '⏱️ Duration', value: currentTrack.duration || 'Unknown', inline: true },
        { name: '🔊 Volume', value: `${playerState.volume}%`, inline: true },
        { name: '🔁 Loop', value: ['Off', 'Track', 'Queue'][playerState.loopMode], inline: true }
      )
      .setThumbnail(currentTrack.thumbnail)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};