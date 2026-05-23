import { SlashCommandBuilder } from 'discord.js';
import { buildNowPlayingV2, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track with progress'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying || !state.currentTrack) {
      return interaction.editReply(buildSimpleV2('Auralyn | Now Playing', 'Nothing is playing right now. Use `/play` to start a session.', AuralynColors.info));
    }

    const msg = await interaction.editReply(buildNowPlayingV2(client, interaction.guildId));
    client.musicPlayer.startNowPlayingRefresh(interaction.guildId, msg);
    return msg;
  },
};
