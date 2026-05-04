import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || queue.tracks.length < 2) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🔀 Shuffle')
          .setDescription('Not enough tracks in the queue to shuffle.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    queue.tracks.shuffle();
    
    await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setTitle('🔀 Queue Shuffled')
        .setDescription(`The queue has been shuffled. **${queue.tracks.length}** tracks randomized.`)
        .setColor(AuralynColors.success)
        .setTimestamp()
      ]
    });
  },
};