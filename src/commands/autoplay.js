import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay — queues related tracks automatically when the queue ends'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);

    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'Start playing a track first before enabling autoplay.', false));
    }

    const enabled = client.musicPlayer.toggleAutoplay(interaction.guildId);

    return interaction.editReply(buildActionFeedback(
      `Autoplay ${enabled ? 'Enabled' : 'Disabled'}`,
      enabled
        ? 'Auralyn will automatically queue related tracks when the queue ends.'
        : 'Autoplay is now off. Playback will stop when the queue is empty.',
    ));
  },
};
