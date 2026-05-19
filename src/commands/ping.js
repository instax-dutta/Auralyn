import { SlashCommandBuilder } from 'discord.js';
import { buildPingEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction) {
    await interaction.deferReply();
    const sent = await interaction.fetchReply();

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    const embed = buildPingEmbed({ latency, wsLatency });
    await interaction.editReply({ embeds: [embed] });
  },
};
