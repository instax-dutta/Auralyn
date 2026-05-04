import { SlashCommandBuilder } from 'discord.js';
import { player } from '../index.js';
import { successEmbed, errorEmbed, musicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Position in queue to skip to (1 = next song)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || !queue.playing) {
      return interaction.reply({ 
        embeds: [errorEmbed('No music is currently playing.', '⏭️ Nothing Playing')] 
      });
    }

    const position = interaction.options.getInteger('position');

    if (position && position > 1 && position <= queue.tracks.length) {
      const tracksToRemove = position - 2;
      for (let i = 0; i <= tracksToRemove; i++) {
        queue.tracks.shift();
      }
      await queue.skip();
      return interaction.reply({ 
        embeds: [musicEmbed(`Skipped to position **${position}** in queue.`, '⏭️ Skipped')]
      });
    }

    const currentTitle = queue.currentTrack?.title || 'Unknown';
    await queue.skip();
    
    await interaction.reply({ 
      embeds: [musicEmbed(`Skipped: **${currentTitle}**`, '⏭️ Track Skipped')]
    });
  },
};