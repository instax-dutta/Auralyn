import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const playerState = client.musicPlayer.getPlayerState(interaction.guildId);
    const currentTrack = playerState.currentTrack;

    if (!currentTrack) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Now Playing', 'Nothing is currently playing.', false)],
        components: [],
      });
    }

    return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Now Playing');
  },
};
