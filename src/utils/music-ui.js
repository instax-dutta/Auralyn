import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { AuralynColors } from './embeds.js';
import { formatLoopMode } from './formatters.js';
import { formatDuration, trackArtwork, trackAuthor, trackLength, trackSourceInfo, trackTitle, trackUri } from './tracks.js';

const NP_BAR_LENGTH = 20;

function buildProgressBar(position, duration, isStream, isPaused = false) {
  if (isStream) return '🔴  Live';
  if (!duration) return '';
  const pct = Math.min(position / duration, 1);
  const filled = Math.round(pct * NP_BAR_LENGTH);
  const bar = '▰'.repeat(filled) + '▱'.repeat(NP_BAR_LENGTH - filled);
  const icon = isPaused ? '⏸' : '▶';
  return `${icon}  ${formatDuration(position)}  \`${bar}\`  ${formatDuration(duration)}`;
}

function loopButtonStyle(loopMode) {
  return loopMode === 0 ? ButtonStyle.Secondary : ButtonStyle.Primary;
}

function loopButtonLabel(loopMode) {
  return `🔁 ${['Off', 'Track', 'Queue'][loopMode] ?? 'Off'}`;
}

export function buildNowPlayingPayload({ track, position, volume, loopMode, queueLength, autoplay, guildId, isPaused, headerText = 'Auralyn | Now Playing' }) {
  const title = trackTitle(track);
  const uri = trackUri(track);
  const author = trackAuthor(track);
  const artwork = trackArtwork(track);
  const duration = track?.info?.length ?? 0;
  const isStream = track?.info?.isStream ?? false;
  const source = trackSourceInfo(track)?.source ?? null;

  const titleLine = uri ? `### [${title}](${uri})` : `### ${title}`;
  const metaLine = [author, source, isStream ? 'Live' : formatDuration(duration)]
    .filter(Boolean).join('  •  ');

  const progressBar = buildProgressBar(position, duration, isStream, isPaused);

  const statsLine = [
    `🔊 ${volume}%`,
    `📋 ${queueLength > 0 ? `${queueLength} queued` : 'Queue empty'}`,
    autoplay ? '🔄 Autoplay' : null,
  ].filter(Boolean).join('  •  ');

  const trackContent = new TextDisplayBuilder().setContent(`${titleLine}\n${metaLine}`);

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.primary)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${headerText}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (artwork) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(trackContent)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork)),
    );
  } else {
    container.addTextDisplayComponents(trackContent);
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  if (progressBar) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(progressBar))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsLine))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`auralyn:skip:${guildId}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`auralyn:${isPaused ? 'resume' : 'pause'}:${guildId}`)
          .setLabel(isPaused ? 'Resume' : 'Pause')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`auralyn:loop:${guildId}`)
          .setLabel(loopButtonLabel(loopMode))
          .setStyle(loopButtonStyle(loopMode)),
        new ButtonBuilder()
          .setCustomId(`auralyn:stop:${guildId}`)
          .setLabel('Stop')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export function buildNowPlayingV2(client, guildId) {
  const state = client.musicPlayer.getPlayerState(guildId);
  return buildNowPlayingPayload({
    track: state.currentTrack,
    position: client.musicPlayer.getPosition(guildId),
    volume: state.volume,
    loopMode: state.loopMode,
    queueLength: state.queue.length,
    autoplay: state.autoplay,
    guildId,
    isPaused: state.isPaused,
  });
}

export function buildPlaylistEmbed({ name, trackCount, firstTrack, wasIdle, requestedBy }) {
  const firstTitle = firstTrack?.info?.title ?? 'Unknown';
  const firstUri = firstTrack?.info?.uri ?? null;
  const artwork = firstTrack?.info?.artworkUrl ?? null;
  const trackRef = firstUri ? `[${firstTitle}](${firstUri})` : firstTitle;

  const lines = [`Added **${trackCount} track${trackCount === 1 ? '' : 's'}** to the queue.`];
  if (wasIdle) lines.push(`\nNow playing **${trackRef}**.`);

  const bodyText = new TextDisplayBuilder().setContent(lines.join(''));

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.success)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Auralyn | Playlist — ${name}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  if (artwork) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(bodyText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork)),
    );
  } else {
    container.addTextDisplayComponents(bodyText);
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requestedBy}`));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function replyWithPlayerSnapshot(interaction, client, guildId, contentTitle = 'Auralyn | Queued') {
  const state = client.musicPlayer.getPlayerState(guildId);
  if (!state.currentTrack) {
    return interaction.editReply(buildSimpleV2(contentTitle, 'The request was processed, but nothing is currently playing.', AuralynColors.success));
  }

  return interaction.editReply(buildNowPlayingPayload({
    track: state.currentTrack,
    position: client.musicPlayer.getPosition(guildId),
    volume: state.volume,
    loopMode: state.loopMode,
    queueLength: state.queue.length,
    autoplay: state.autoplay,
    guildId,
    isPaused: state.isPaused,
    headerText: contentTitle,
  }));
}

export function buildQueueReply(client, guildId) {
  const state = client.musicPlayer.getPlayerState(guildId);
  const currentTrack = state.currentTrack;
  const queue = state.queue;

  if (!currentTrack && queue.length === 0) {
    return buildSimpleV2('Auralyn | Queue', 'The queue is empty right now. Start with `/play` to spin up a session.', AuralynColors.info);
  }

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Queue'))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  if (currentTrack) {
    const npLine = trackUri(currentTrack)
      ? `**Now Playing**\n[${trackTitle(currentTrack)}](${trackUri(currentTrack)})  •  \`${trackLength(currentTrack)}\``
      : `**Now Playing**\n${trackTitle(currentTrack)}  •  \`${trackLength(currentTrack)}\``;
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(npLine))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }

  const upNextText = queue.length > 0
    ? queue.slice(0, 10).map((t, i) =>
        `\`${i + 1}.\` ${trackUri(t) ? `[${trackTitle(t)}](${trackUri(t)})` : trackTitle(t)}  •  \`${trackLength(t)}\``,
      ).join('\n')
    : 'Queue is empty.';
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Up Next**\n${upNextText}`));

  if (queue.length > 10) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# And ${queue.length - 10} more in queue`));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Loop: ${formatLoopMode(state.loopMode)}  •  Volume: ${state.volume}%`));

  if (currentTrack) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`auralyn:skip:${guildId}`).setLabel('Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`auralyn:${state.isPaused ? 'resume' : 'pause'}:${guildId}`).setLabel(state.isPaused ? 'Resume' : 'Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`auralyn:stop:${guildId}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export function buildActionFeedback(action, detail, ok = true) {
  const color = ok ? AuralynColors.success : AuralynColors.error;
  return buildSimpleV2(`Auralyn | ${action}`, detail, color);
}

export function buildSimpleV2(title, description, color = AuralynColors.info) {
  const content = description ? `**${title}**\n${description}` : `**${title}**`;
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export function buildRemovedTrackEmbed(track) {
  return buildActionFeedback('Queue Updated', `Removed **${trackTitle(track)}** from the queue.`);
}

export function buildPlayCommandReply({ interaction, client, guildId, addedTrack, startedPlayback }) {
  if (startedPlayback) {
    return buildNowPlayingV2(client, guildId);
  }
  const title = trackTitle(addedTrack);
  const uri = trackUri(addedTrack);
  const linked = uri ? `[${title}](${uri})` : title;
  return buildActionFeedback('Added to Queue', `Queued **${linked}** for this session.`);
}
