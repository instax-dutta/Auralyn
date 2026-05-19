import { SlashCommandBuilder } from 'discord.js';
import { replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();
    return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Now Playing');
  },
};
