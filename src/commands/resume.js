import { SlashCommandBuilder } from 'discord.js';
import { player } from '../index.js';
import { successEmbed, errorEmbed, musicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused song'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || !queue.playing) {
      return interaction.reply({ 
        embeds: [errorEmbed('No music is currently playing.', '▶️ Nothing Playing')] 
      });
    }

    if (!queue.paused) {
      return interaction.reply({ 
        embeds: [errorEmbed('Music is not paused.', '▶️ Already Playing')] 
      });
    }

    queue.resume();
    
    const currentTrack = queue.currentTrack;
    await interaction.reply({ 
      embeds: [musicEmbed(`Resumed: **[${currentTrack?.title}](${currentTrack?.url})**`, '▶️ Music Resumed')]
    });
  },
};