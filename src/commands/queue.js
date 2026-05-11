import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current music queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const playerState = client.musicPlayer.getPlayerState(interaction.guildId);
    const queue = playerState.queue;
    const currentTrack = playerState.currentTrack;

    if (!currentTrack && queue.length === 0) {
      return interaction.editReply('The queue is empty!');
    }

    // We'll create an embed for the queue
    const embed = new EmbedBuilder()
      .setColor(AuralynColors.primary)
      .setTitle('🎵 Music Queue');

    if (currentTrack) {
      embed.addFields({
        name: '▶️ Now Playing',
        value: `[${currentTrack.title}](${currentTrack.uri || '#'}) \`${currentTrack.duration || 'Unknown'}\``,
        inline: false,
      });
    }

    if (queue.length > 0) {
      const tracksInQueue = queue.slice(0, 10).map((track, index) => 
        '`' + (index + 1) + '.` [' + track.title + '](' + (track.uri || '#') + ') `' + (track.duration || 'Unknown') + '`'
      ).join('\n');

      embed.addFields({
        name: '📋 Up Next',
        value: tracksInQueue || 'Queue is empty',
        inline: false,
      });

      if (queue.length > 10) {
        embed.setFooter({ text: `And ${queue.length - 10} more tracks...` });
      }
    } else {
      embed.addFields({
        name: '📋 Up Next',
        value: 'Queue is empty',
        inline: false,
      });
    }

    embed.setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
