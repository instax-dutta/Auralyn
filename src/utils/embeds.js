import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { formatLoopMode } from './formatters.js';
import {
  trackArtwork,
  trackAuthor,
  trackLength,
  trackTitle,
  trackUri,
  trackSourceInfo,
} from './tracks.js';

export const AuralynColors = {
  primary: 0x6B4EFF,
  success: 0x4ADE80,
  error: 0xEF4444,
  warning: 0xF59E0B,
  info: 0x3B82F6,
  dark: 0x1E1E2E,
  accent: 0xA78BFA,
};

export const AURALYN_BRAND = {
  name: 'Auralyn',
  iconUrl: 'https://cdn.discordapp.com/attachments/000000000000000000/000000000000000000/auralyn-logo.png',
};

export function createEmbed(options = {}) {
  const {
    title = '',
    description = '',
    color = AuralynColors.primary,
    thumbnail = null,
    image = null,
    fields = [],
    footer = null,
    timestamp = false,
  } = options;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  if (image) {
    embed.setImage(image);
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  if (footer) {
    embed.setFooter({ text: footer.text, iconURL: footer.iconURL });
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

export function successEmbed(description, title = '✅ Success') {
  return createEmbed({
    title,
    description,
    color: AuralynColors.success,
    timestamp: true,
  });
}

export function errorEmbed(description, title = '❌ Error') {
  return createEmbed({
    title,
    description,
    color: AuralynColors.error,
    timestamp: true,
  });
}

export function infoEmbed(description, title = 'ℹ️ Info') {
  return createEmbed({
    title,
    description,
    color: AuralynColors.info,
    timestamp: true,
  });
}

export function musicEmbed(description, title = '🎵 Auralyn') {
  return createEmbed({
    title,
    description,
    color: AuralynColors.primary,
    timestamp: true,
  });
}

export function createNowPlayingEmbed({
  track,
  title = 'Auralyn | Now Playing',
  loopModeLabel,
  volume,
  queueLength,
  requestedBy,
}) {
  const fields = [
    { name: 'Artist', value: trackAuthor(track), inline: true },
    { name: 'Duration', value: trackLength(track), inline: true },
    { name: 'Volume', value: `${volume}%`, inline: true },
    { name: 'Loop', value: loopModeLabel, inline: true },
    { name: 'Up Next', value: queueLength > 0 ? `${queueLength} queued` : 'Queue is empty', inline: true },
    { name: 'Requested By', value: requestedBy ?? 'Unknown', inline: true },
  ];

  const sourceInfo = trackSourceInfo(track);
  if (sourceInfo) {
    fields.splice(1, 0, { name: 'Source', value: sourceInfo.source, inline: true });
  }

  const embed = createEmbed({
    title,
    description: trackUri(track) ? `**[${trackTitle(track)}](${trackUri(track)})**` : `**${trackTitle(track)}**`,
    color: AuralynColors.primary,
    timestamp: true,
    footer: {
      text: 'Auralyn playback session',
    },
  }).addFields(...fields);

  const artwork = trackArtwork(track);
  if (artwork) embed.setThumbnail(artwork);
  return embed;
}

export function createQueueEmbed({ currentTrack, queue, loopMode, volume }) {
  const embed = createEmbed({
    title: 'Auralyn | Queue',
    description: currentTrack ? 'Current playback and upcoming tracks.' : 'No track is currently playing.',
    color: AuralynColors.accent,
    timestamp: true,
  });

  if (currentTrack) {
    embed.addFields({
      name: 'Now Playing',
      value: trackUri(currentTrack)
        ? `[${trackTitle(currentTrack)}](${trackUri(currentTrack)}) • \`${trackLength(currentTrack)}\``
        : `${trackTitle(currentTrack)} • \`${trackLength(currentTrack)}\``,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: 'Up Next',
      value: queue.length > 0
        ? queue.slice(0, 10).map((track, index) => `\`${index + 1}.\` ${trackUri(track) ? `[${trackTitle(track)}](${trackUri(track)})` : trackTitle(track)} • \`${trackLength(track)}\``).join('\n')
        : 'Queue is empty.',
      inline: false,
    },
    {
      name: 'Playback',
      value: `Loop: ${formatLoopMode(loopMode)}\nVolume: ${volume}%`,
      inline: false,
    },
  );

  if (queue.length > 10) {
    embed.setFooter({ text: `And ${queue.length - 10} more in queue` });
  }

  return embed;
}

export function buildPlayerControls({ guildId, isPaused }) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`auralyn:skip:${guildId}`)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`auralyn:${isPaused ? 'resume' : 'pause'}:${guildId}`)
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`auralyn:stop:${guildId}`)
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function buildPingEmbed({ latency, wsLatency }) {
  let statusColor = AuralynColors.success;
  if (latency > 200) {
    statusColor = AuralynColors.warning;
  }
  if (latency > 500) {
    statusColor = AuralynColors.error;
  }

  return createEmbed({
    title: 'Auralyn | Status',
    description: 'Operational and ready for playback.',
    color: statusColor,
    timestamp: true,
    fields: [
      { name: 'API Latency', value: `\`${latency}ms\``, inline: true },
      { name: 'WebSocket', value: `\`${wsLatency}ms\``, inline: true },
      { name: 'Bot', value: 'Online', inline: true },
    ],
  });
}

export function buildPlayReply({
  guildId,
  isPaused,
  requestedBy,
  addedTrack,
  currentTrack,
  queueLength,
  loopModeLabel,
  volume,
  startedPlayback,
}) {
  const embeds = [];

  if (startedPlayback) {
    embeds.push(
      createNowPlayingEmbed({
        track: currentTrack,
        title: 'Auralyn | Now Playing',
        loopModeLabel,
        volume,
        queueLength,
        requestedBy,
      }),
    );
  } else {
    embeds.push(
      successEmbed(
        trackUri(addedTrack)
          ? `Queued **[${trackTitle(addedTrack)}](${trackUri(addedTrack)})** for this session.`
          : `Queued **${trackTitle(addedTrack)}** for this session.`,
        'Auralyn | Added to Queue',
      ),
    );

    embeds.push(
      createNowPlayingEmbed({
        track: currentTrack,
        title: 'Auralyn | Now Playing',
        loopModeLabel,
        volume,
        queueLength,
        requestedBy,
      }),
    );
  }

  return {
    embeds,
    components: buildPlayerControls({ guildId, isPaused }),
  };
}
