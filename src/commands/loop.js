import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { player } from '../index.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle loop mode')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' },
          { name: 'Off', value: 'off' }
        )
    ),
  async execute(interaction) {
    const queue = player.nodes.get(interaction.guildId);

    if (!queue) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setTitle('🔁 Loop')
          .setDescription('No music is currently playing.')
          .setColor(AuralynColors.warning)
          .setTimestamp()
        ]
      });
    }

    const mode = interaction.options.getString('mode');
    let title, description;

    if (mode === 'track') {
      queue.setLoop('track');
      title = '🔂 Track Loop Enabled';
      description = 'Current track will loop continuously.';
    } else if (mode === 'queue') {
      queue.setLoop('queue');
      title = '🔁 Queue Loop Enabled';
      description = 'The entire queue will loop continuously.';
    } else {
      queue.setLoop('off');
      title = '➡️ Loop Disabled';
      description = 'Loop mode has been turned off.';
    }

    await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(AuralynColors.primary)
        .setTimestamp()
      ]
    });
  },
};