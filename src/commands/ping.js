import { SlashCommandBuilder } from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';
import { buildSimpleV2 } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction) {
    await interaction.deferReply();
    const sent = await interaction.fetchReply();

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    let color = AuralynColors.success;
    if (latency > 200) color = AuralynColors.warning;
    if (latency > 500) color = AuralynColors.error;

    const detail = `API Latency: \`${latency}ms\`\nWebSocket: \`${wsLatency}ms\`\nBot: Online`;
    await interaction.editReply(buildSimpleV2('Auralyn | Status', detail, color));
  },
};
