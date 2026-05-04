import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Position in queue (run /queue to see positions)')
        .setRequired(true)
        .setMinValue(1)
    ),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue || queue.tracks.length === 0) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🗑️ Remove Track')
          .setDescription('The queue is empty.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    const position = interaction.options.getInteger('position') - 1;

    if (position < 0 || position >= queue.tracks.length) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🗑️ Remove Track')
          .setDescription('Invalid position specified.')
          .setColor(AuralynColors.error)
          .setTimestamp()
        ]
      });
    }

    const track = queue.tracks[position];
    queue.tracks.splice(position, 1);

    await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setTitle('🗑️ Track Removed')
        .setDescription(`Removed: **${track.title}**`)
        .setColor(AuralynColors.success)
        .setTimestamp()
      ]
    });
  },
};