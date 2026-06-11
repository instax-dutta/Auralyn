import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('musicpanel')
    .setDescription('Post a persistent music control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post the panel in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;

      const container = new ContainerBuilder()
        .setAccentColor(AuralynColors.primary)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Music Panel'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Use the buttons below to control playback.'))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`auralyn:panel_prev:${interaction.guildId}`).setLabel('Previous').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auralyn:panel_pause:${interaction.guildId}`).setLabel('Pause / Resume').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`auralyn:panel_skip:${interaction.guildId}`).setLabel('Skip').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auralyn:panel_loop:${interaction.guildId}`).setLabel('Loop').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`auralyn:panel_stop:${interaction.guildId}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
          ),
        );

      const message = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

      await client.musicPlayer.settingsStore.update(interaction.guildId, {
        musicPanelChannelId: channel.id,
        musicPanelMessageId: message.id,
      });

      return interaction.editReply(buildActionFeedback('Music Panel', `Panel posted in ${channel}.`));
    } catch (error) {
      client.logger.error('Error in /musicpanel', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
