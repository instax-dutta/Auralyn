import { SlashCommandBuilder } from 'discord.js';
import { player } from '../index.js';
import { successEmbed, errorEmbed, nowPlayingEmbed, musicEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or URL')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    if (!query) {
      return interaction.editReply({ embeds: [errorEmbed('No query provided', '❌ Missing Input')] });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply({ 
        embeds: [errorEmbed('You must be in a voice channel to use this command.', '🎤 Join Voice Channel')] 
      });
    }

    const queue = player.nodes.create(interaction.guild, {
      metadata: {
        channel: interaction.channel,
        requestedBy: interaction.user,
      },
      leaveOnEnd: true,
      leaveOnStop: true,
      leaveOnEmpty: true,
    });

    if (!queue.connection) {
      try {
        await queue.connect(voiceChannel);
      } catch (err) {
        return interaction.editReply({ 
          embeds: [errorEmbed('Could not join your voice channel.', '🔌 Connection Failed')] 
        });
      }
    }

    try {
      const searchQuery = query.startsWith('http') ? query : `ytsearch:${query}`;
      const result = await player.search(searchQuery, {
        requestedBy: interaction.user,
      });

      if (!result.tracks.length) {
        return interaction.editReply({ 
          embeds: [errorEmbed('No results found for your search.', '🔍 No Results')] 
        });
      }

      const track = result.tracks[0];

      if (result.playlist) {
        for (const t of result.tracks) {
          await queue.addTrack(t);
        }
        await interaction.editReply({ 
          embeds: [musicEmbed(`Added **${result.tracks.length}** tracks from playlist: **[${result.playlist.title}](${result.playlist.url})**`, '📀 Playlist Added')] 
        });
      } else {
        await queue.addTrack(track);
        
        if (!queue.playing) {
          try {
            await queue.node.play();
          } catch (playErr) {
            console.error('Play error:', playErr);
            queue.delete();
            return interaction.editReply({ 
              embeds: [errorEmbed('Could not play this track. It may be unavailable or geo-restricted. Try a different source.', '🎵 Playback Error')] 
            });
          }
        }

        await interaction.editReply({ 
          embeds: [nowPlayingEmbed(track, interaction.user, interaction.client)] 
        });
      }
    } catch (err) {
      console.error('Play error:', err);
      return interaction.editReply({ 
        embeds: [errorEmbed(`An error occurred: ${err.message}`, '⚠️ Error')] 
      });
    }
  },
};