import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';
import { trackTitle } from '../utils/tracks.js';

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
  async execute(interaction, client) {
    await interaction.deferReply();
    const queue = client.musicPlayer.getQueue(interaction.guildId);

    if (queue.length === 0) {
      return interaction.editReply({ 
        embeds: [new EmbedBuilder()
          .setTitle('Remove Track')
          .setDescription('The queue is empty.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    const position = interaction.options.getInteger('position');
    const track = client.musicPlayer.remove(interaction.guildId, position);
    if (!track) {
      return interaction.editReply({ 
        embeds: [new EmbedBuilder()
          .setTitle('Remove Track')
          .setDescription('Invalid position specified.')
          .setColor(AuralynColors.error)
          .setTimestamp()
        ]
      });
    }

    return interaction.editReply({ 
      embeds: [new EmbedBuilder()
        .setTitle('Track Removed')
        .setDescription(`Removed: **${trackTitle(track)}**`)
        .setColor(AuralynColors.success)
        .setTimestamp()
      ]
    });
  },
};
