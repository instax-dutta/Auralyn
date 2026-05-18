import { SlashCommandBuilder } from 'discord.js';
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
    console.log(`/play received with query: ${interaction.options.getString('query') ?? '<missing>'}`);
    await interaction.deferReply();
    console.log('/play deferred reply successfully');

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      console.log('/play aborted because member is not in a voice channel');
      return interaction.editReply('You need to be in a voice channel to play music!');
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      console.log(`/play aborted because bot is already in voice channel ${botVoiceChannelId}`);
      return interaction.editReply('I am already connected to a different voice channel!');
    }

    try {
      console.log(`/play resolving track for query: ${query}`);
      const { track } = await resolveTrack(shoukaku, query);
      if (!track) {
        console.log(`/play found no playable result for query: ${query}`);
        return interaction.editReply('I could not find a playable result for that query.');
      }

      console.log(`/play resolved track: ${trackTitle(track)}`);
      await client.musicPlayer.enqueue({
        guildId: interaction.guildId,
        track,
        textChannel: interaction.channel,
        voiceChannel,
      });
      console.log(`/play enqueued track for guild ${interaction.guildId}`);

      const uri = trackUri(track);
      const title = trackTitle(track);
      return interaction.editReply(`Added to queue: ${uri ? `**[${title}](${uri})**` : `**${title}**`}`);
    } catch (error) {
      console.error('Error in play command:', error);
      return interaction.editReply('There was an error while trying to play that song!');
    }
  },
};
