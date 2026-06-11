import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Show internal debug information')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const guildId = interaction.guildId;
      const state = client.musicPlayer.getPlayerState(guildId);
      const settings = await client.musicPlayer.settingsStore.get(guildId);

      const shardLine = `Shard ${client.shardInfo?.ids?.join(',') ?? '0'} / ${client.shardInfo?.count ?? 1}`;

      const nodeLines = [...client.shoukaku.nodes.values()].map((node) =>
        `**${node.name}** — connected: ${node.state === 2}, players: ${node.stats?.players ?? 0}, playing: ${node.stats?.playingPlayers ?? 0}`,
      );

      const filterLayers = state.filterLayers ?? {};
      const filterLine = Object.entries(filterLayers)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || 'none';

      const settingsSummary = [
        `controlMode: ${settings.controlMode}`,
        `djModeEnabled: ${settings.djModeEnabled}`,
        `djRoleIds: ${settings.djRoleIds.length}`,
        `twentyFourSeven: ${settings.twentyFourSeven}`,
        `vcStatusEnabled: ${settings.vcStatusEnabled}`,
        `announceTracks: ${settings.announceTracks}`,
      ].join('\n');

      const description = [
        shardLine,
        '',
        '**Nodes**',
        nodeLines.join('\n') || 'No nodes connected',
        '',
        '**Player**',
        `Queue length: ${state.queue.length}`,
        `Current track: ${state.currentTrack?.info?.title ?? 'none'}`,
        `Filters: ${filterLine}`,
        '',
        '**Settings**',
        settingsSummary,
      ].join('\n');

      return interaction.editReply(buildSimpleV2('Auralyn | Debug', description, AuralynColors.info));
    } catch (error) {
      client.logger.error('Error in /debug', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
