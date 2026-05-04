import { SlashCommandBuilder } from 'discord.js';
import { player } from '../index.js';
import { successEmbed, errorEmbed, musicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || !queue.playing) {
      return interaction.reply({ 
        embeds: [errorEmbed('No music is currently playing.', '⏸️ Nothing Playing')] 
      });
    }

    queue.pause();
    
    const currentTrack = queue.currentTrack;
    await interaction.reply({ 
      embeds: [musicEmbed(`Paused: **[${currentTrack?.title}](${currentTrack?.url})**`, '⏸️ Music Paused')]
    });
  },
};