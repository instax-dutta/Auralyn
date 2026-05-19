import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, AuralynColors } from '../utils/embeds.js';

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
    .setDescription('Get an invite link to add Auralyn to your server'),

  async execute(interaction) {
    await interaction.deferReply();

    const clientId = interaction.client.application?.id;
    if (!clientId) {
      return interaction.editReply({
        embeds: [
          createEmbed({
            title: 'Auralyn | Invite',
            description: 'Could not determine the bot\'s client ID. Try again later.',
            color: AuralynColors.error,
            timestamp: true,
          }),
        ],
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      permissions: String(INVITE_PERMISSIONS),
      scope: SCOPES.join(' '),
    });

    const inviteUrl = `https://discord.com/oauth2/authorize?${params}`;

    const embed = createEmbed({
      title: 'Auralyn | Invite',
      description: 'Add Auralyn to your server — all the permissions it needs, nothing it doesn\'t.',
      color: AuralynColors.primary,
      timestamp: true,
      footer: { text: 'Auralyn music bot' },
      fields: [
        { name: 'Permissions Included', value: PERMISSION_LABELS.map(p => `• ${p}`).join('\n'), inline: false },
        { name: 'Scopes', value: 'Bot\nSlash Commands', inline: false },
      ],
    });

    return interaction.editReply({
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Invite Auralyn',
              url: inviteUrl,
            },
          ],
        },
      ],
    });
  },
};
