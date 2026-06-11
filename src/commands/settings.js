import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

function formatValue(value) {
  if (value === null || value === undefined) return '`none`';
  if (Array.isArray(value)) return value.length ? `\`${value.join(', ')}\`` : '`none`';
  if (typeof value === 'object') return Object.keys(value).length ? `\`${JSON.stringify(value)}\`` : '`none`';
  return `\`${value}\``;
}

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or reset this server\'s settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('action')
        .setDescription('view or reset')
        .setRequired(false)
        .addChoices(
          { name: 'View', value: 'view' },
          { name: 'Reset', value: 'reset' },
        )),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const action = interaction.options.getString('action') ?? 'view';

      if (action === 'reset') {
        const container = new ContainerBuilder()
          .setAccentColor(AuralynColors.warning)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Reset Settings'))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('Are you sure you want to reset all settings to defaults?'))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`auralyn:settings-reset:${interaction.guildId}`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`auralyn:settings-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            ),
          );
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const lines = Object.entries(settings).map(([key, value]) => `**${key}**: ${formatValue(value)}`);

      const container = new ContainerBuilder()
        .setAccentColor(AuralynColors.info)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Server Settings'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      client.logger.error('Error in /settings', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
