import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { createEmbed, AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || queue.tracks.length === 0) {
      return interaction.reply({ 
        embeds: [createEmbed({
          title: '📋 Empty Queue',
          description: 'There are no tracks in the queue.',
          color: AuralynColors.warning,
        })]
      });
    }

    const tracks = queue.tracks.slice(0, 10).map((track, i) => {
      return `\`${i + 1}.\` **[${track.title}](${track.url})** - \`${track.duration}\``;
    });

    const currentTrack = queue.currentTrack;
    const totalDuration = queue.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    const formattedDuration = Math.floor(totalDuration / 60000) + ' min';

    const embed = new EmbedBuilder()
      .setTitle('📋 Music Queue')
      .setColor(AuralynColors.primary)
      .setTimestamp()
      .addFields(
        { 
          name: '▶️ Now Playing', 
          value: currentTrack ? `**[${currentTrack.title}](${currentTrack.url})** - \`${currentTrack.duration}\`` : 'Nothing playing',
          inline: false 
        },
        { 
          name: '📝 Up Next', 
          value: tracks.join('\n') || 'No more tracks',
          inline: false 
        },
        { 
          name: '📊 Queue Stats', 
          value: `**${queue.tracks.length}** tracks • **${formattedDuration}** total`,
          inline: false 
        }
      );

    await interaction.reply({ embeds: [embed] });
  },
};