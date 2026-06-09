import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
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

function progressBar(pos, total, len = 16) {
  if (!total || total <= 0) return '';
  const filled = Math.round((pos / total) * len);
  const bar = '▓'.repeat(filled) + '░'.repeat(len - filled);
  return `\`${bar}\` ${formatMs(pos)} / ${formatMs(total)}`;
}

function sourceLabel(uri = '') {
  if (uri.includes('youtube.com') || uri.includes('youtu.be')) return '🎬 YouTube';
  if (uri.includes('spotify.com')) return '🟢 Spotify';
  if (uri.includes('soundcloud.com')) return '🟠 SoundCloud';
  if (uri.includes('twitch.tv')) return '🟣 Twitch';
  return '🎵 Audio';
}

export default {
  data: new SlashCommandBuilder()
    .setName('grab')
    .setDescription('Send the current track info to your DMs'),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying || !state.currentTrack) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to grab.', false));
    }

    const track = state.currentTrack;
    const info = track.info ?? {};
    const pos = client.musicPlayer.getPosition(interaction.guildId);
    const duration = info.length ?? 0;
    const isStream = info.isStream ?? false;

    const embed = new EmbedBuilder()
      .setColor(AuralynColors.primary)
      .setAuthor({ name: `Grabbed from ${interaction.guild.name}`, iconURL: interaction.guild.iconURL({ size: 64 }) ?? undefined })
      .setTitle(info.title ?? 'Unknown Track')
      .setURL(info.uri ?? null)
      .setDescription(isStream
        ? `**${info.author ?? 'Unknown Artist'}**\n🔴 Live Stream`
        : `**${info.author ?? 'Unknown Artist'}**\n${progressBar(pos, duration)}`)
      .addFields(
        {
          name: 'Duration',
          value: isStream ? '🔴 Live' : formatMs(duration),
          inline: true,
        },
        {
          name: 'Source',
          value: sourceLabel(info.uri ?? ''),
          inline: true,
        },
        {
          name: 'Requested by',
          value: track.requestedByName ? `@${track.requestedByName}` : 'Unknown',
          inline: true,
        },
      )
      .setFooter({ text: 'Auralyn • auralyn.sdad.pro' })
      .setTimestamp();

    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);

    try {
      await interaction.user.send({ embeds: [embed] });
      return interaction.editReply(buildActionFeedback('Grabbed', 'Track info sent to your DMs.'));
    } catch {
      return interaction.editReply(buildActionFeedback('DMs Closed', 'Could not send a DM — enable DMs from server members and try again.', false));
    }
  },
};
