import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song to play (YouTube URL, Spotify URL, or search terms)')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    // Defer the reply as this might take time
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply('You need to be in a voice channel to play music!');
    }

    // Check if the bot is already in a voice channel
    const connection = client.voice.adapterCreator ? client.voice.connections.first() : null;
    if (connection && connection.channelId !== voiceChannel.id) {
      return interaction.editReply('I am already connected to a different voice channel!');
    }

    try {
      // Join the voice channel if not already connected
      if (!connection) {
        await voiceChannel.join();
      }

      // For now, we'll simulate track resolution
      // In a real implementation, you'd use a resolver like ytdl-core or similar to get track info
      // But since we're using Lavalink with youtube-source and LavaSrc, we can pass the query directly to Lavalink
      // Lavalink will handle resolving YouTube URLs, Spotify URLs (via LavaSrc), and search terms

      const track = {
        identifier: query, // This could be a URL or search term
        isSeekable: true,
        author: 'Unknown',
        title: query.length > 50 ? query.substring(0, 47) + '...' : query,
        duration: 'Unknown', // Will be updated when Lavalink resolves it
        thumbnail: null,
        uri: query.startsWith('http') ? query : null,
      };

      // Play the track
      await client.musicPlayer.play(interaction.guildId, track, interaction.channel, voiceChannel);

      // Update the message
      return interaction.editReply(`Added to queue: **[${track.title}]**${track.uri ? `(${track.uri})` : ''}`);
    } catch (error) {
      console.error('Error in play command:', error);
      return interaction.editReply('There was an error while trying to play that song!');
    }
  },
};