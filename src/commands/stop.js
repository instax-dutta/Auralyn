import { SlashCommandBuilder } from 'discord.js';
import { player } from '../index.js';
import { successEmbed, errorEmbed, musicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || !queue.playing) {
      return interaction.reply({ 
        embeds: [errorEmbed('No music is currently playing.', '🛑 Nothing Playing')] 
      });
    }

    const trackCount = queue.tracks.length + (queue.currentTrack ? 1 : 0);
    queue.delete();
    
    await interaction.reply({ 
      embeds: [musicEmbed(`Stopped music and cleared **${trackCount}** tracks from the queue.`, '🛑 Music Stopped')]
    });
  },
};