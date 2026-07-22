import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { buildActionFeedback, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';
import { formatDuration } from '../utils/tracks.js';

const PER_PAGE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('liked')
    .setDescription('View your liked songs')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const page = interaction.options.getInteger('page') ?? 1;
      const songs = await client.likedStore.getLikedSongs(interaction.user.id);

      if (songs.length === 0) {
        return interaction.editReply(buildSimpleV2('Auralyn | Liked Songs', 'You have no liked songs. Use `/like` while playing a track.', AuralynColors.info));
      }

      const totalPages = Math.ceil(songs.length / PER_PAGE);
      const offset = (page - 1) * PER_PAGE;
      const pageSongs = songs.slice(offset, offset + PER_PAGE);

      const lines = pageSongs.map((s, i) => {
        const pos = offset + i + 1;
        const title = s.uri ? `[${s.title}](${s.uri})` : s.title;
        const duration = formatDuration(s.duration);
        return `\`${pos}.\` ${title}  •  \`${duration}\``;
      });

      const container = new ContainerBuilder()
        .setAccentColor(AuralynColors.accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Auralyn | Liked Songs (Page ${page}/${totalPages})`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Total: ${songs.length} tracks`));

      if (totalPages > 1) {
        const row = new ActionRowBuilder();
        if (page > 1) {
          row.addComponents(new ButtonBuilder().setCustomId(`auralyn:liked:page:${interaction.user.id}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary));
        }
        if (page < totalPages) {
          row.addComponents(new ButtonBuilder().setCustomId(`auralyn:liked:page:${interaction.user.id}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
        }
        container.addActionRowComponents(row);
      }

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      client.logger.error('Error in /liked', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
