import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('grab')
    .setDescription('Send the current track info to your DMs'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying || !state.currentTrack) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to grab.', false));
    }

    const track = state.currentTrack;
    const info = track.info ?? {};

    const embed = new EmbedBuilder()
      .setColor(AuralynColors.primary)
      .setTitle(info.title ?? 'Unknown Track')
      .setURL(info.uri ?? null)
      .setDescription(`**${info.author ?? 'Unknown Artist'}**`)
      .addFields(
        { name: 'Duration', value: info.isStream ? '🔴 Live' : formatMs(info.length ?? 0), inline: true },
        { name: 'Server', value: interaction.guild.name, inline: true },
      );

    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);

    try {
      await interaction.user.send({ embeds: [embed] });
      return interaction.editReply(buildActionFeedback('Grabbed', 'Track info sent to your DMs.'));
    } catch {
      return interaction.editReply(buildActionFeedback('DMs Closed', 'Could not send a DM — enable DMs from server members and try again.', false));
    }
  },
};
