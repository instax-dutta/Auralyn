import { ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildPlayCommandReply } from '../utils/music-ui.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { formatDuration, trackTitle, trackAuthor } from '../utils/tracks.js';

function searchPrefix(source) {
  const map = { youtube: 'ytsearch', spotify: 'spsearch', soundcloud: 'scsearch' };
  return map[source] ?? 'ytsearch';
}

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a track and pick from results')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Search terms')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before searching.', false)],
        components: [],
      });
    }

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
      const source = settings?.sourcePriority?.[0] ?? 'youtube';
      const prefix = searchPrefix(source);

      const node = shoukaku.getIdealNode();
      if (!node) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Node', 'No Lavalink node is available.', false)],
          components: [],
        });
      }

      const result = await node.rest.resolve(`${prefix}:${query.trim()}`);
      if (!result || result.loadType !== 'search' || !result.data?.length) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Results', `No results found for "${query}".`, false)],
          components: [],
        });
      }

      const tracks = result.data.slice(0, 5);
      const description = tracks.map((track, i) =>
        `**${i + 1}.** ${trackTitle(track)} — ${trackAuthor(track)} \`${formatDuration(track.info?.length)}\``,
      ).join('\n');

      const embed = {
        color: 0x6B4EFF,
        title: 'Search Results',
        description,
        footer: { text: `Source: ${source} • Click a button to play` },
        timestamp: new Date().toISOString(),
      };

      const rows = [];
      for (let i = 0; i < tracks.length; i += 3) {
        const chunk = tracks.slice(i, i + 3);
        rows.push(
          new ActionRowBuilder().addComponents(
            chunk.map((_, j) =>
              new ButtonBuilder()
                .setCustomId(`search:${interaction.guildId}:${i + j}`)
                .setLabel(`${i + j + 1}`)
                .setStyle(ButtonStyle.Primary),
            ),
          ),
        );
      }

      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`search:cancel:${interaction.guildId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        ),
      );

      const reply = await interaction.editReply({
        embeds: [embed],
        components: rows,
      });

      const filter = (btn) => {
        if (btn.user.id !== interaction.user.id) {
          btn.reply({ content: 'These search results are not yours.', flags: MessageFlags.Ephemeral });
          return false;
        }
        return true;
      };

      const collector = reply.createMessageComponentCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async (btn) => {
        const parts = btn.customId.split(':');
        const action = parts[1];

        if (action === 'cancel') {
          await btn.update({
            embeds: [buildActionFeedback('Search Cancelled', 'Search was cancelled.', false)],
            components: [],
          });
          return;
        }

        const index = parseInt(parts[2], 10);
        const track = tracks[index];
        if (!track) {
          await btn.update({
            embeds: [buildActionFeedback('Invalid Selection', 'That selection is no longer available.', false)],
            components: [],
          });
          return;
        }

        await btn.deferUpdate();

        const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
        await client.musicPlayer.enqueue({
          guildId: interaction.guildId,
          track,
          textChannel: interaction.channel,
          voiceChannel,
        });

        await interaction.editReply(
          buildPlayCommandReply({
            interaction,
            client,
            guildId: interaction.guildId,
            addedTrack: track,
            startedPlayback: wasIdle,
          }),
        );
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          try {
            await interaction.editReply({
              embeds: [buildActionFeedback('Search Expired', 'Search results expired.', false)],
              components: [],
            });
          } catch {
            /* ignore */
          }
        }
      });
    } catch (error) {
      client.logger.error('Error in search command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Search Failed', 'There was an error while searching.', false)],
        components: [],
      });
    }
  },
};
