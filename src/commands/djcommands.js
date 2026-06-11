import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('djcommands')
    .setDescription('List commands restricted to DJs'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const restrictions = settings.commandRestrictions ?? {};
      const djOnly = Object.entries(restrictions).filter(([, rule]) => rule?.djOnly === true);

      if (djOnly.length === 0) {
        return interaction.editReply(buildSimpleV2('Auralyn | DJ Commands', 'No commands are currently DJ-restricted.', AuralynColors.info));
      }

      const lines = djOnly.map(([cmd, rule]) => {
        const channel = rule.channelId ? ` (restricted to <#${rule.channelId}>)` : '';
        return `\`/${cmd}\`${channel}`;
      });

      return interaction.editReply(buildSimpleV2('Auralyn | DJ Commands', lines.join('\n'), AuralynColors.info));
    } catch (error) {
      client.logger.error('Error in /djcommands', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
