import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction) {
    await interaction.deferReply();
    const sent = await interaction.fetchReply();

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;
    
    let statusColor = AuralynColors.success;
    if (latency > 200) {
      statusColor = AuralynColors.warning;
    }
    if (latency > 500) {
      statusColor = AuralynColors.error;
    }

    const embed = new EmbedBuilder()
      .setTitle('Auralyn Status')
      .setColor(statusColor)
      .addFields(
        { name: 'API Latency', value: `\`${latency}ms\``, inline: true },
        { name: 'WebSocket', value: `\`${wsLatency}ms\``, inline: true },
        { name: 'Bot', value: 'Online', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
