import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

export const AuralynColors = {
  primary: 0x6B4EFF,
  success: 0x4ADE80,
  error: 0xEF4444,
  warning: 0xF59E0B,
  info: 0x3B82F6,
  dark: 0x1E1E2E,
  accent: 0xA78BFA,
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

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer.text, iconURL: footer.iconURL });
  if (timestamp) embed.setTimestamp();

  return embed;
}
