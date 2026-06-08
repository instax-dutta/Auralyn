import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { parseHumanDuration } from '../utils/time-parser.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sleeptimer')
    .setDescription('Stop playback after a set duration, or cancel an active timer')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Time until stop — e.g. 30m, 1h, 2h30m. Use "off" to cancel.')
        .setRequired(true)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const input = interaction.options.getString('duration').trim().toLowerCase();

    if (input === 'off' || input === 'cancel') {
      client.musicPlayer.clearSleepTimer(interaction.guildId);
      return interaction.editReply(buildActionFeedback('Sleep Timer', 'Sleep timer cancelled.'));
    }

    const ms = parseHumanDuration(input);
    if (!ms) {
      return interaction.editReply(buildActionFeedback('Invalid Duration', 'Use a format like `30m`, `1h`, `2h30m`, or `off` to cancel.', false));
    }

    const MAX_MS = 24 * 60 * 60 * 1000; // 24h cap
    if (ms > MAX_MS) {
      return interaction.editReply(buildActionFeedback('Invalid Duration', 'Maximum sleep timer is 24 hours.', false));
    }

    client.musicPlayer.setSleepTimer(interaction.guildId, ms);

    const minutes = Math.round(ms / 60000);
    const display = minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`.trim()
      : `${minutes}m`;

    return interaction.editReply(buildActionFeedback('Sleep Timer Set', `Playback will stop in **${display}**.`));
  },
};
