import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { createEmbed, AuralynColors } from '../utils/embeds.js';
import { trackTitle, trackAuthor } from '../utils/tracks.js';

const LRCLIB_API = 'https://lrclib.net/api';

export default {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyrics for the current track or a specific song')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song title and artist (optional — uses current track if omitted)')
        .setRequired(false)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    try {
      let query = interaction.options.getString('query');

      if (!query) {
        const currentTrack = client.musicPlayer.getCurrentTrack(interaction.guildId);
        if (!currentTrack) {
          return interaction.editReply({
            embeds: [buildActionFeedback('No Track', 'Nothing is playing right now. Provide a search query or play a track first.', false)],
            components: [],
          });
        }
        const title = trackTitle(currentTrack);
        const artist = trackAuthor(currentTrack);
        query = `${artist} ${title}`;
      }

      const url = `${LRCLIB_API}/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      if (!response.ok) {
        return interaction.editReply({
          embeds: [buildActionFeedback('Lyrics Unavailable', 'Could not fetch lyrics. Try again later.', false)],
          components: [],
        });
      }

      const results = await response.json();
      if (!results || results.length === 0) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Lyrics', `No lyrics found for "${query}".`, false)],
          components: [],
        });
      }

      const best = results[0];
      const lyricsText = best.plainLyrics || best.syncedLyrics || 'No lyrics available.';

      const MAX_LENGTH = 4000;
      const truncated = lyricsText.length > MAX_LENGTH
        ? `${lyricsText.slice(0, MAX_LENGTH)}\n\n*— lyrics truncated —*`
        : lyricsText;

      const embed = createEmbed({
        title: `${best.artistName ?? 'Unknown'} — ${best.trackName ?? 'Unknown'}`,
        description: `\`\`\`${truncated}\`\`\``,
        color: AuralynColors.primary,
        timestamp: true,
        footer: { text: 'Powered by LRClib' },
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      client.logger.error('Error in lyrics command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Lyrics Failed', 'There was an error while fetching lyrics.', false)],
        components: [],
      });
    }
  },
};
