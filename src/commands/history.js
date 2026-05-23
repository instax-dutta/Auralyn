import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';
import { buildActionFeedback } from '../utils/music-ui.js';
import { formatDuration, trackTitle, trackUri } from '../utils/tracks.js';

export default {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show the last 10 tracks played in this session'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const history = client.musicPlayer.getHistory(interaction.guildId);

    if (history.length === 0) {
      return interaction.editReply(buildActionFeedback('No History', 'No tracks have been played yet in this session.'));
    }

    const lines = history.map((track, i) => {
      const title = trackTitle(track);
      const uri = trackUri(track);
      const duration = track.info?.isStream ? '🔴 Live' : formatDuration(track.info?.length);
      const linked = uri ? `[${title}](${uri})` : title;
      return `\`${i + 1}.\` ${linked} · \`${duration}\``;
    });

    const container = new ContainerBuilder()
      .setAccentColor(AuralynColors.accent)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Recently Played'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${history.length} track${history.length === 1 ? '' : 's'} · this session only`));

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
