import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

/**
 * Lavalink 15-band EQ frequency reference:
 *   Band  0:   25 Hz  (sub-bass)       Band  8:  1.0 kHz (mid)
 *   Band  1:   40 Hz  (sub-bass)       Band  9:  1.6 kHz (upper-mid)
 *   Band  2:   63 Hz  (bass)           Band 10:  2.5 kHz (presence)
 *   Band  3:  100 Hz  (bass)           Band 11:  4.0 kHz (presence)
 *   Band  4:  160 Hz  (low-mid)        Band 12:  6.3 kHz (brilliance)
 *   Band  5:  250 Hz  (low-mid)        Band 13: 10.0 kHz (brilliance/air)
 *   Band  6:  400 Hz  (mid)            Band 14: 16.0 kHz (air)
 *   Band  7:  630 Hz  (mid)
 *
 * Gain range: -0.25 … 1.0 (0.0 = unity / no change)
 *
 * Design principles applied to every preset below:
 *   • Smooth, gradual transitions between adjacent bands
 *   • Compensating cuts when boosting to avoid clipping / mud
 *   • Gain values kept moderate (-0.10 … +0.15) for safe, universal playback
 *   • Each curve shaped to the genre's real-world EQ conventions
 */
const FILTER_PRESETS = {
  // ── Enhanced low-end with sub-bass rumble and maintained clarity ─────
  bassboost: {
    equalizer: [
      { band: 0, gain: 0.10 },  { band: 1, gain: 0.12 },
      { band: 2, gain: 0.15 },  { band: 3, gain: 0.13 },
      { band: 4, gain: 0.08 },  { band: 5, gain: 0.03 },
      { band: 6, gain: -0.02 }, { band: 7, gain: -0.04 },
      { band: 8, gain: -0.03 }, { band: 9, gain: -0.02 },
      { band: 10, gain: 0.0 },  { band: 11, gain: 0.02 },
      { band: 12, gain: 0.03 }, { band: 13, gain: 0.02 },
      { band: 14, gain: 0.01 },
    ],
  },

  // ── Classical – natural, open soundstage with gentle air lift ────────
  classical: {
    equalizer: [
      { band: 0, gain: -0.02 }, { band: 1, gain: -0.02 },
      { band: 2, gain: 0.0 },   { band: 3, gain: 0.0 },
      { band: 4, gain: 0.0 },   { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 },   { band: 7, gain: 0.0 },
      { band: 8, gain: 0.02 },  { band: 9, gain: 0.03 },
      { band: 10, gain: 0.04 }, { band: 11, gain: 0.05 },
      { band: 12, gain: 0.04 }, { band: 13, gain: 0.03 },
      { band: 14, gain: 0.02 },
    ],
  },

  // ── Sub-bass thump + high-end sparkle, clean synth mids ─────────────
  electronic: {
    equalizer: [
      { band: 0, gain: 0.12 },  { band: 1, gain: 0.10 },
      { band: 2, gain: 0.08 },  { band: 3, gain: 0.04 },
      { band: 4, gain: 0.0 },   { band: 5, gain: -0.03 },
      { band: 6, gain: -0.04 }, { band: 7, gain: -0.03 },
      { band: 8, gain: -0.02 }, { band: 9, gain: 0.0 },
      { band: 10, gain: 0.03 }, { band: 11, gain: 0.06 },
      { band: 12, gain: 0.10 }, { band: 13, gain: 0.12 },
      { band: 14, gain: 0.10 },
    ],
  },

  // ── Unity gain – resets all EQ adjustments ──────────────────────────
  flat: {
    equalizer: [
      { band: 0, gain: 0.0 },  { band: 1, gain: 0.0 },
      { band: 2, gain: 0.0 },  { band: 3, gain: 0.0 },
      { band: 4, gain: 0.0 },  { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 },  { band: 7, gain: 0.0 },
      { band: 8, gain: 0.0 },  { band: 9, gain: 0.0 },
      { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 },
      { band: 14, gain: 0.0 },
    ],
  },

  // ── Warm mids, natural brass/sax presence, gentle high rolloff ──────
  jazz: {
    equalizer: [
      { band: 0, gain: -0.02 }, { band: 1, gain: 0.0 },
      { band: 2, gain: 0.02 },  { band: 3, gain: 0.04 },
      { band: 4, gain: 0.06 },  { band: 5, gain: 0.08 },
      { band: 6, gain: 0.06 },  { band: 7, gain: 0.04 },
      { band: 8, gain: 0.03 },  { band: 9, gain: 0.04 },
      { band: 10, gain: 0.06 }, { band: 11, gain: 0.04 },
      { band: 12, gain: 0.02 }, { band: 13, gain: 0.0 },
      { band: 14, gain: -0.02 },
    ],
  },

  // ── Fletcher-Munson compensation for low-volume listening ───────────
  loudness: {
    equalizer: [
      { band: 0, gain: 0.12 },  { band: 1, gain: 0.10 },
      { band: 2, gain: 0.06 },  { band: 3, gain: 0.02 },
      { band: 4, gain: -0.02 }, { band: 5, gain: -0.04 },
      { band: 6, gain: -0.06 }, { band: 7, gain: -0.06 },
      { band: 8, gain: -0.04 }, { band: 9, gain: -0.02 },
      { band: 10, gain: 0.02 }, { band: 11, gain: 0.06 },
      { band: 12, gain: 0.10 }, { band: 13, gain: 0.12 },
      { band: 14, gain: 0.10 },
    ],
  },

  // ── Aggressive V-scoop for heavy guitars and double-kick ────────────
  metal: {
    equalizer: [
      { band: 0, gain: 0.08 },  { band: 1, gain: 0.10 },
      { band: 2, gain: 0.12 },  { band: 3, gain: 0.08 },
      { band: 4, gain: 0.03 },  { band: 5, gain: -0.04 },
      { band: 6, gain: -0.08 }, { band: 7, gain: -0.10 },
      { band: 8, gain: -0.08 }, { band: 9, gain: -0.04 },
      { band: 10, gain: 0.03 }, { band: 11, gain: 0.08 },
      { band: 12, gain: 0.12 }, { band: 13, gain: 0.10 },
      { band: 14, gain: 0.08 },
    ],
  },

  // ── Focused mid-range body with gentle extremes rolloff ─────────────
  piano: {
    equalizer: [
      { band: 0, gain: -0.06 }, { band: 1, gain: -0.04 },
      { band: 2, gain: -0.02 }, { band: 3, gain: 0.0 },
      { band: 4, gain: 0.03 },  { band: 5, gain: 0.06 },
      { band: 6, gain: 0.08 },  { band: 7, gain: 0.10 },
      { band: 8, gain: 0.08 },  { band: 9, gain: 0.06 },
      { band: 10, gain: 0.03 }, { band: 11, gain: 0.0 },
      { band: 12, gain: -0.02 }, { band: 13, gain: -0.04 },
      { band: 14, gain: -0.06 },
    ],
  },

  // ── Smiley-face curve – boosted bass groove and vocal sparkle ───────
  pop: {
    equalizer: [
      { band: 0, gain: 0.06 },  { band: 1, gain: 0.08 },
      { band: 2, gain: 0.05 },  { band: 3, gain: 0.03 },
      { band: 4, gain: 0.0 },   { band: 5, gain: -0.03 },
      { band: 6, gain: -0.05 }, { band: 7, gain: -0.06 },
      { band: 8, gain: -0.05 }, { band: 9, gain: -0.03 },
      { band: 10, gain: 0.0 },  { band: 11, gain: 0.03 },
      { band: 12, gain: 0.06 }, { band: 13, gain: 0.08 },
      { band: 14, gain: 0.06 },
    ],
  },

  // ── Deep sub-bass, smooth mids, silky highs ────────────────────────
  rnb: {
    equalizer: [
      { band: 0, gain: 0.12 },  { band: 1, gain: 0.10 },
      { band: 2, gain: 0.08 },  { band: 3, gain: 0.06 },
      { band: 4, gain: 0.03 },  { band: 5, gain: 0.0 },
      { band: 6, gain: -0.02 }, { band: 7, gain: -0.03 },
      { band: 8, gain: 0.0 },   { band: 9, gain: 0.02 },
      { band: 10, gain: 0.04 }, { band: 11, gain: 0.06 },
      { band: 12, gain: 0.04 }, { band: 13, gain: 0.02 },
      { band: 14, gain: 0.0 },
    ],
  },

  // ── Punchy lows, present guitars, bright cymbals ────────────────────
  rock: {
    equalizer: [
      { band: 0, gain: 0.04 },  { band: 1, gain: 0.06 },
      { band: 2, gain: 0.10 },  { band: 3, gain: 0.08 },
      { band: 4, gain: 0.04 },  { band: 5, gain: 0.0 },
      { band: 6, gain: -0.04 }, { band: 7, gain: -0.06 },
      { band: 8, gain: -0.04 }, { band: 9, gain: 0.02 },
      { band: 10, gain: 0.06 }, { band: 11, gain: 0.10 },
      { band: 12, gain: 0.08 }, { band: 13, gain: 0.06 },
      { band: 14, gain: 0.04 },
    ],
  },

  // ── High-end clarity and air, mirror of bass boost ──────────────────
  trebleboost: {
    equalizer: [
      { band: 0, gain: 0.01 },  { band: 1, gain: 0.02 },
      { band: 2, gain: 0.03 },  { band: 3, gain: 0.02 },
      { band: 4, gain: 0.0 },   { band: 5, gain: -0.02 },
      { band: 6, gain: -0.03 }, { band: 7, gain: -0.04 },
      { band: 8, gain: -0.02 }, { band: 9, gain: 0.03 },
      { band: 10, gain: 0.08 }, { band: 11, gain: 0.13 },
      { band: 12, gain: 0.15 }, { band: 13, gain: 0.12 },
      { band: 14, gain: 0.10 },
    ],
  },

  // ── Voice-centered bell curve (300 Hz–3 kHz emphasis) ───────────────
  vocal: {
    equalizer: [
      { band: 0, gain: -0.06 }, { band: 1, gain: -0.04 },
      { band: 2, gain: -0.02 }, { band: 3, gain: 0.02 },
      { band: 4, gain: 0.06 },  { band: 5, gain: 0.10 },
      { band: 6, gain: 0.12 },  { band: 7, gain: 0.10 },
      { band: 8, gain: 0.08 },  { band: 9, gain: 0.06 },
      { band: 10, gain: 0.04 }, { band: 11, gain: 0.02 },
      { band: 12, gain: 0.0 },  { band: 13, gain: -0.02 },
      { band: 14, gain: -0.04 },
    ],
  },
};

// Display names for user-facing feedback
const PRESET_LABELS = {
  bassboost: 'Bass Boost',
  classical: 'Classical',
  electronic: 'Electronic',
  flat: 'Flat',
  jazz: 'Jazz',
  loudness: 'Loudness',
  metal: 'Metal',
  piano: 'Piano',
  pop: 'Pop',
  rnb: 'R&B',
  rock: 'Rock',
  trebleboost: 'Treble Boost',
  vocal: 'Vocal',
};

export default {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply an audio filter preset to the current playback')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('preset')
        .setDescription('Choose a filter preset')
        .setRequired(true)
        .addChoices(
          { name: '🔊 Bass Boost', value: 'bassboost' },
          { name: '🎻 Classical', value: 'classical' },
          { name: '🎛️ Electronic', value: 'electronic' },
          { name: '⏸️ Flat (reset)', value: 'flat' },
          { name: '🎷 Jazz', value: 'jazz' },
          { name: '🔉 Loudness', value: 'loudness' },
          { name: '🤘 Metal', value: 'metal' },
          { name: '🎹 Piano', value: 'piano' },
          { name: '🎤 Pop', value: 'pop' },
          { name: '🎵 R&B', value: 'rnb' },
          { name: '🎸 Rock', value: 'rock' },
          { name: '🔔 Treble Boost', value: 'trebleboost' },
          { name: '🎙️ Vocal', value: 'vocal' },
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

      const label = PRESET_LABELS[preset] ?? preset;
      return interaction.editReply({
        embeds: [buildActionFeedback(
          'Filter Applied',
          `Applied **${label}** preset to the current playback.`,
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
