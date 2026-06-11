import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('switchaudionode')
    .setDescription('Move this server to a different Lavalink node'),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const settings = await client.musicPlayer.settingsStore.get(interaction.guildId);
      const djCheck = requireDjOrAdmin(interaction, settings);
      if (!djCheck.allowed) return interaction.editReply(djCheck.reply);

      const nodes = [...client.shoukaku.nodes.values()];
      if (nodes.length <= 1) {
        return interaction.editReply(buildActionFeedback('Switch Node', 'No alternate nodes configured.', false));
      }

      const player = client.musicPlayer.getPlayerState(interaction.guildId).lavalinkPlayer;
      if (!player) {
        return interaction.editReply(buildActionFeedback('Switch Node', 'Nothing is currently connected.', false));
      }

      const currentName = player.node?.name;
      const candidates = nodes
        .filter((n) => n.name !== currentName && n.state === 2)
        .sort((a, b) => (a.stats?.playingPlayers ?? 0) - (b.stats?.playingPlayers ?? 0));

      if (candidates.length === 0) {
        return interaction.editReply(buildActionFeedback('Switch Node', 'No alternate nodes are currently connected.', false));
      }

      const target = candidates[0];
      await player.move(target.name);

      return interaction.editReply(buildActionFeedback('Node Switched', `Moved to node **${target.name}**.`));
    } catch (error) {
      client.logger.error('Error in /switchaudionode', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
