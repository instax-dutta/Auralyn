import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join your voice channel without starting playback'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice?.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply(buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false));
    }

    try {
      await client.musicPlayer.join(interaction.guildId, voiceChannel, interaction.channel);
      return interaction.editReply(buildActionFeedback('Joined', `Connected to **${voiceChannel.name}**.`));
    } catch (error) {
      client.logger.error('Error in join command', error);
      return interaction.editReply(buildActionFeedback('Join Failed', 'Could not connect to the voice channel.', false));
    }
  },
};
