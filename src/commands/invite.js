import { InteractionContextType, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';

const INVITE_PERMISSIONS = 2150755648;
const SCOPES = ['bot', 'applications.commands'];

const PERMISSION_LABELS = [
  'View Channels',
  'Send Messages',
  'Manage Messages',
  'Embed Links',
  'Attach Files',
  'Read Message History',
  'Add Reactions',
  'Use Application Commands',
  'Connect',
  'Speak',
  'Priority Speaker',
];

export default {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get an invite link to add Auralyn to your server')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply();

    const clientId = interaction.client.application?.id;
    if (!clientId) {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(AuralynColors.error)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('### Auralyn | Invite\nCould not determine the bot\'s client ID. Try again later.'),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      permissions: String(INVITE_PERMISSIONS),
      scope: SCOPES.join(' '),
    });

    const inviteUrl = `https://discord.com/oauth2/authorize?${params}`;

    const container = new ContainerBuilder()
      .setAccentColor(AuralynColors.primary)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Auralyn | Invite'),
        new TextDisplayBuilder().setContent('Add Auralyn to your server — all the permissions it needs, nothing it doesn\'t.'),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Permissions Included**\n${PERMISSION_LABELS.map(p => `• ${p}`).join('\n')}`),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Scopes**\nBot\nSlash Commands'),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Invite Auralyn')
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl),
        ),
      );

    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
