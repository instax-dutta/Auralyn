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
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply('You need to be in a voice channel to play music!');
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply('I am already connected to a different voice channel!');
    }

    try {
      const { track } = await resolveTrack(shoukaku, query);
      if (!track) {
        return interaction.editReply('I could not find a playable result for that query.');
      }

      await client.musicPlayer.enqueue({
        guildId: interaction.guildId,
        track,
        textChannel: interaction.channel,
        voiceChannel,
      });

      const uri = trackUri(track);
      const title = trackTitle(track);
      return interaction.editReply(`Added to queue: ${uri ? `**[${title}](${uri})**` : `**${title}**`}`);
    } catch (error) {
      console.error('Error in play command:', error);
      return interaction.editReply('There was an error while trying to play that song!');
    }
  },
};
