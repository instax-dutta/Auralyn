import {
  buildPlayerControls,
  createNowPlayingEmbed,
  createQueueEmbed,
  errorEmbed,
  infoEmbed,
  successEmbed,
} from './embeds.js';
import { formatLoopMode } from './formatters.js';
import { trackTitle } from './tracks.js';

export async function replyWithPlayerSnapshot(interaction, client, guildId, contentTitle = 'Queued') {
  const state = client.musicPlayer.getPlayerState(guildId);
  const currentTrack = state.currentTrack;

  if (!currentTrack) {
    return interaction.editReply({
      embeds: [successEmbed('The request was processed, but nothing is currently playing.', contentTitle)],
      components: [],
    });
  }

  return interaction.editReply({
    embeds: [
      createNowPlayingEmbed({
        track: currentTrack,
        loopModeLabel: formatLoopMode(state.loopMode),
        volume: state.volume,
        queueLength: state.queue.length,
        requestedBy: interaction.user?.username ?? 'Unknown',
      }),
    ],
    components: buildPlayerControls({
      guildId,
      isPaused: state.isPaused,
    }),
  });
}

export function buildQueueReply(client, guildId) {
  const state = client.musicPlayer.getPlayerState(guildId);
  const currentTrack = state.currentTrack;
  const queue = state.queue;

  if (!currentTrack && queue.length === 0) {
    return {
      embeds: [infoEmbed('The queue is empty right now. Start with `/play` to spin up a session.', 'Auralyn | Queue')],
      components: [],
    };
  }

  return {
    embeds: [
      createQueueEmbed({
        currentTrack,
        queue,
        loopMode: state.loopMode,
        volume: state.volume,
      }),
    ],
    components: currentTrack ? buildPlayerControls({ guildId, isPaused: state.isPaused }) : [],
  };
}

export function buildActionFeedback(action, detail, ok = true) {
  if (ok) {
    return successEmbed(detail, `Auralyn | ${action}`);
  }

  return errorEmbed(detail, `Auralyn | ${action}`);
}

export function buildRemovedTrackEmbed(track) {
  return successEmbed(`Removed **${trackTitle(track)}** from the queue.`, 'Auralyn | Queue Updated');
}
