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
import { buildActionFeedback } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clearliked')
    .setDescription('Clear all your liked songs'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const songs = await client.likedStore.getLikedSongs(interaction.user.id);
      if (songs.length === 0) {
        return interaction.editReply(buildActionFeedback('No Liked Songs', 'You have no liked songs to clear.', false));
      }

      const container = new ContainerBuilder()
        .setAccentColor(AuralynColors.warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Clear Liked Songs'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`This will delete **${songs.length}** liked track${songs.length === 1 ? '' : 's'}. Continue?`))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`auralyn:liked:clear:confirm:${interaction.user.id}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`auralyn:liked:clear:cancel:${interaction.user.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
          ),
        );

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      client.logger.error('Error in /clearliked', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
