import { SlashCommandBuilder } from 'discord.js';
import { buildPingEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction) {
    const wsLatency = interaction.client.ws.ping;
    await interaction.deferReply();
    const latency = Date.now() - interaction.createdTimestamp;

    const embed = buildPingEmbed({ latency, wsLatency });
    await interaction.editReply({ embeds: [embed] });
  },
};
