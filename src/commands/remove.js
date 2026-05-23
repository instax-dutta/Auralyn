import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildQueueReply } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Position in queue (run /queue to see positions)')
        .setRequired(true)
        .setMinValue(1)
    ),
  async execute(interaction, client) {
    await interaction.deferReply();
    const queue = client.musicPlayer.getQueue(interaction.guildId);

    if (queue.length === 0) {
      return interaction.editReply(buildActionFeedback('Remove Track', 'The queue is empty.', false));
    }

    const position = interaction.options.getInteger('position');
    const track = client.musicPlayer.remove(interaction.guildId, position);
    if (!track) {
      return interaction.editReply(buildActionFeedback('Remove Track', 'That queue position is invalid.', false));
    }

    return interaction.editReply(buildQueueReply(client, interaction.guildId));
  },
};
