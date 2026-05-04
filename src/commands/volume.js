import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the volume (0-100)')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('Volume level')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🔊 Volume')
          .setDescription('No music is currently playing.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    const volume = interaction.options.getInteger('level');
    queue.node.setVolume(volume);

    const bar = '█'.repeat(Math.floor(volume / 10)) + '░'.repeat(10 - Math.floor(volume / 10));
    
    await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setTitle('🔊 Volume Changed')
        .setDescription(`Volume set to **${volume}%**`)
        .addFields({ name: '🔊 Volume Bar', value: `\`${bar}\` ${volume}%` })
        .setColor(AuralynColors.success)
        .setTimestamp()
      ]
    });
  },
};