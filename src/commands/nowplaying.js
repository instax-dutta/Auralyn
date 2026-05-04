import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);
    const track = queue?.currentTrack;

    if (!track) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🎶 Nothing Playing')
          .setDescription('There is no track currently playing.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎶 Now Playing')
      .setColor(AuralynColors.success)
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: '👤 Artist', value: track.author || 'Unknown', inline: true },
        { name: '⏱️ Duration', value: track.duration || 'Unknown', inline: true },
        { name: '🎧 Requested by', value: queue?.metadata?.requestedBy?.username || 'Unknown', inline: true },
      )
      .setThumbnail(track.thumbnail)
      .setURL(track.url)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};