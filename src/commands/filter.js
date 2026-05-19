import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

const FILTER_PRESETS = {
  bassboost: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.05 },
      { band: 2, gain: 0.08 }, { band: 3, gain: 0.06 },
      { band: 4, gain: 0.03 }, { band: 5, gain: 0.0 },
      { band: 6, gain: -0.02 }, { band: 7, gain: -0.04 },
      { band: 8, gain: -0.06 }, { band: 9, gain: -0.06 },
      { band: 10, gain: -0.06 }, { band: 11, gain: -0.06 },
      { band: 12, gain: -0.06 }, { band: 13, gain: -0.04 },
      { band: 14, gain: -0.02 },
    ],
  },
  pop: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.02 },
      { band: 2, gain: 0.04 }, { band: 3, gain: 0.06 },
      { band: 4, gain: 0.04 }, { band: 5, gain: 0.0 },
      { band: 6, gain: -0.02 }, { band: 7, gain: -0.04 },
      { band: 8, gain: -0.02 }, { band: 9, gain: 0.0 },
      { band: 10, gain: 0.02 }, { band: 11, gain: 0.04 },
      { band: 12, gain: 0.06 }, { band: 13, gain: 0.04 },
      { band: 14, gain: 0.02 },
    ],
  },
  electronic: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.0 },
      { band: 2, gain: 0.03 }, { band: 3, gain: 0.06 },
      { band: 4, gain: 0.08 }, { band: 5, gain: 0.04 },
      { band: 6, gain: 0.0 }, { band: 7, gain: -0.03 },
      { band: 8, gain: -0.05 }, { band: 9, gain: -0.03 },
      { band: 10, gain: 0.0 }, { band: 11, gain: 0.03 },
      { band: 12, gain: 0.06 }, { band: 13, gain: 0.08 },
      { band: 14, gain: 0.06 },
    ],
  },
  flat: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.0 },
      { band: 2, gain: 0.0 }, { band: 3, gain: 0.0 },
      { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 }, { band: 7, gain: 0.0 },
      { band: 8, gain: 0.0 }, { band: 9, gain: 0.0 },
      { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 },
      { band: 14, gain: 0.0 },
    ],
  },
  jazz: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.0 },
      { band: 2, gain: 0.02 }, { band: 3, gain: 0.04 },
      { band: 4, gain: 0.04 }, { band: 5, gain: 0.04 },
      { band: 6, gain: 0.04 }, { band: 7, gain: 0.06 },
      { band: 8, gain: 0.06 }, { band: 9, gain: 0.04 },
      { band: 10, gain: 0.02 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 },
      { band: 14, gain: 0.0 },
    ],
  },
  metal: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.04 },
      { band: 2, gain: 0.08 }, { band: 3, gain: 0.10 },
      { band: 4, gain: 0.06 }, { band: 5, gain: 0.0 },
      { band: 6, gain: -0.04 }, { band: 7, gain: -0.06 },
      { band: 8, gain: 0.0 }, { band: 9, gain: 0.06 },
      { band: 10, gain: 0.10 }, { band: 11, gain: 0.08 },
      { band: 12, gain: 0.04 }, { band: 13, gain: 0.06 },
      { band: 14, gain: 0.04 },
    ],
  },
  piano: {
    equalizer: [
      { band: 0, gain: -0.04 }, { band: 1, gain: -0.02 },
      { band: 2, gain: 0.0 }, { band: 3, gain: 0.02 },
      { band: 4, gain: 0.04 }, { band: 5, gain: 0.06 },
      { band: 6, gain: 0.08 }, { band: 7, gain: 0.06 },
      { band: 8, gain: 0.04 }, { band: 9, gain: 0.02 },
      { band: 10, gain: 0.0 }, { band: 11, gain: -0.02 },
      { band: 12, gain: -0.04 }, { band: 13, gain: -0.06 },
      { band: 14, gain: -0.08 },
    ],
  },
  rock: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.04 },
      { band: 2, gain: 0.08 }, { band: 3, gain: 0.10 },
      { band: 4, gain: 0.06 }, { band: 5, gain: 0.02 },
      { band: 6, gain: 0.0 }, { band: 7, gain: -0.04 },
      { band: 8, gain: -0.02 }, { band: 9, gain: 0.02 },
      { band: 10, gain: 0.06 }, { band: 11, gain: 0.10 },
      { band: 12, gain: 0.08 }, { band: 13, gain: 0.04 },
      { band: 14, gain: 0.0 },
    ],
  },
};

export default {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply an audio filter preset to the current playback')
    .addStringOption(option =>
      option.setName('preset')
        .setDescription('Choose a filter preset')
        .setRequired(true)
        .addChoices(
          { name: 'Bass Boost', value: 'bassboost' },
          { name: 'Pop', value: 'pop' },
          { name: 'Electronic', value: 'electronic' },
          { name: 'Flat (reset)', value: 'flat' },
          { name: 'Jazz', value: 'jazz' },
          { name: 'Metal', value: 'metal' },
          { name: 'Piano', value: 'piano' },
          { name: 'Rock', value: 'rock' },
        )),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before using filters.', false)],
        components: [],
      });
    }

    try {
      const preset = interaction.options.getString('preset');
      const filters = FILTER_PRESETS[preset] ?? {};

      const player = client.musicPlayer.getState(interaction.guildId).lavalinkPlayer;
      if (!player) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Session', 'There is no active playback session.', false)],
          components: [],
        });
      }

      await player.setFilters(filters);

      return interaction.editReply({
        embeds: [buildActionFeedback(
          'Filter Applied',
          `Applied **${preset.charAt(0).toUpperCase() + preset.slice(1)}** preset to the current playback.`,
        )],
        components: [],
      });
    } catch (error) {
      client.logger.error('Error in filter command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Filter Failed', 'There was an error while applying the filter.', false)],
        components: [],
      });
    }
  },
};
