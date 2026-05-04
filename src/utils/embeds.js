import { EmbedBuilder } from 'discord.js';

export const AuralynColors = {
  primary: 0x6B4EFF,
  success: 0x4ADE80,
  error: 0xEF4444,
  warning: 0xF59E0B,
  info: 0x3B82F6,
  dark: 0x1E1E2E,
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

export function nowPlayingEmbed(track, requestedBy, client) {
  return createEmbed({
    title: '🎶 Now Playing',
    description: `**[${track.title}](${track.url})**`,
    color: AuralynColors.success,
    fields: [
      { name: '👤 Artist', value: track.author || 'Unknown', inline: true },
      { name: '⏱️ Duration', value: track.duration || 'Unknown', inline: true },
      { name: '🎧 Requested by', value: requestedBy?.username || 'Unknown', inline: true },
    ],
    thumbnail: track.thumbnail || null,
    timestamp: true,
  });
}

export function queueEmbed(tracks, currentTrack, totalDuration) {
  const trackList = tracks.slice(0, 10).map((track, i) => 
    `\`${i + 1}.\` **[${track.title}](${track.url})** - \`${track.duration}\``
  ).join('\n');

  return createEmbed({
    title: '🎵 Music Queue',
    color: AuralynColors.primary,
    fields: [
      {
        name: '▶️ Now Playing',
        value: currentTrack ? `**[${currentTrack.title}](${currentTrack.url})**` : 'Nothing playing',
      },
      {
        name: '📋 Up Next',
        value: trackList || 'Queue is empty',
      },
      {
        name: '📊 Queue Stats',
        value: `**${tracks.length}** tracks • Total: ${totalDuration}`,
      },
    ],
    timestamp: true,
  });
}