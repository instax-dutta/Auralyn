import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Move a queue track to play next (position 1)')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Queue position to bump (1 = already next)')
        .setMinValue(2)
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    const queue = state.queue ?? [];
    const position = interaction.options.getInteger('position');

    if (queue.length === 0) {
      return interaction.editReply(buildActionFeedback('Queue Empty', 'There are no tracks to bump.', false));
    }

    if (position > queue.length) {
      return interaction.editReply(buildActionFeedback('Invalid Position', `Queue only has **${queue.length}** track${queue.length === 1 ? '' : 's'}.`, false));
    }

    const track = client.musicPlayer.queueManager.move(interaction.guildId, position, 1);
    if (!track) {
      return interaction.editReply(buildActionFeedback('Bump Failed', 'Could not move that track.', false));
    }

    return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | Bumped **${track.info?.title ?? 'Unknown'}**`);
  },
};
