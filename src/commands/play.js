import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { resolveTrack, trackTitle, trackUri } from '../utils/tracks.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song to play (YouTube URL, Spotify URL, or search terms)')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before using `/play`.', false)],
        components: [],
      });
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false)],
        components: [],
      });
    }

    try {
      const { track } = await resolveTrack(shoukaku, query);
      if (!track) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Results', 'Auralyn could not find a playable result for that search.', false)],
          components: [],
        });
      }

      await client.musicPlayer.enqueue({
        guildId: interaction.guildId,
        track,
        textChannel: interaction.channel,
        voiceChannel,
      });
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Added to Queue');
    } catch (error) {
      client.logger.error('Error in play command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Playback Failed', 'There was an error while trying to play that song.', false)],
        components: [],
      });
    }
  },
};
