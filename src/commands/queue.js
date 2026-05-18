import { SlashCommandBuilder } from 'discord.js';
import { buildQueueReply } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current music queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();
    return interaction.editReply(buildQueueReply(client, interaction.guildId));
  },
};
