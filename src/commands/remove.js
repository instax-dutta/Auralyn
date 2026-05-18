import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildRemovedTrackEmbed, buildQueueReply } from '../utils/music-ui.js';

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
      return interaction.editReply({
        embeds: [buildActionFeedback('Remove Track', 'The queue is empty.', false)],
        components: [],
      });
    }

    const position = interaction.options.getInteger('position');
    const track = client.musicPlayer.remove(interaction.guildId, position);
    if (!track) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Remove Track', 'That queue position is invalid.', false)],
        components: [],
      });
    }

    const reply = buildQueueReply(client, interaction.guildId);
    reply.embeds.unshift(buildRemovedTrackEmbed(track));
    return interaction.editReply(reply);
  },
};
