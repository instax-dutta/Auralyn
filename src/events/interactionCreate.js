import { Events, MessageFlags, Routes } from 'discord.js';
import { buildActionFeedback, buildNowPlayingV2, buildSimpleV2 } from '../utils/music-ui.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { AuralynColors } from '../utils/embeds.js';
import { LOOP_OFF, LOOP_TRACK, LOOP_QUEUE } from '../music/queue.js';

const LOOP_CYCLE = [LOOP_TRACK, LOOP_QUEUE, LOOP_OFF];
const lastPatchTime = new Map();

function patchV2(client, channelId, messageId, payload, guildId) {
  const now = Date.now();
  const key = `${guildId}:${messageId}`;
  const last = lastPatchTime.get(key) ?? 0;
  if (now - last < 1_000) {
    return Promise.resolve();
  }
  lastPatchTime.set(key, now);
  return client.rest.patch(Routes.channelMessage(channelId, messageId), {
    body: {
      flags: payload.flags,
      components: payload.components.map(c => c.toJSON()),
    },
  }).catch(error => {
    if (error.code === 50001 || error.code === 10008 || error.status === 404) {
      client.logger.debug(`Cannot update message ${messageId} in channel ${channelId}: ${error.message}`);
      return;
    }
    throw error;
  });
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client, shoukaku) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('auralyn:')) return;

      const [, action, guildId] = interaction.customId.split(':');
      if (!guildId || guildId !== interaction.guildId) {
        await interaction.reply({
          ...buildActionFeedback('Controls', 'These controls belong to a different server session.', false),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === 'settings-reset' || action === 'settings-cancel') {
        await interaction.deferUpdate();
        try {
          if (action === 'settings-reset') {
            await client.musicPlayer.settingsStore.update(guildId, defaultGuildSettings);
            await interaction.editReply(buildActionFeedback('Settings Reset', 'All settings have been restored to defaults.'));
          } else {
            await interaction.editReply(buildActionFeedback('Settings', 'Reset cancelled.'));
          }
        } catch (error) {
          client.logger.error(`Error handling ${interaction.customId}`, error);
        }
        return;
      }

      const PANEL_ACTIONS = new Set(['panel_prev', 'panel_pause', 'panel_skip', 'panel_loop', 'panel_stop']);
      if (PANEL_ACTIONS.has(action)) {
        await interaction.deferUpdate();
        try {
          if (action === 'panel_prev') {
            await client.musicPlayer.previous(guildId);
          } else if (action === 'panel_pause') {
            const state = client.musicPlayer.getPlayerState(guildId);
            if (state.isPaused) {
              await client.musicPlayer.resume(guildId);
            } else {
              await client.musicPlayer.pause(guildId);
            }
          } else if (action === 'panel_skip') {
            await client.musicPlayer.skip(guildId);
          } else if (action === 'panel_loop') {
            const current = client.musicPlayer.getPlayerState(guildId).loopMode;
            const next = LOOP_CYCLE[current] ?? LOOP_OFF;
            client.musicPlayer.setLoopMode(guildId, next);
          } else if (action === 'panel_stop') {
            await client.musicPlayer.stop(guildId);
          }
        } catch (error) {
          client.logger.error(`Error handling panel button ${interaction.customId}`, error);
        }
        return;
      }

      // Playlist pagination: auralyn:pl:page:<userId>:<playlistName>:<page>
      if (action === 'pl' && interaction.customId.split(':')[2] === 'page') {
        const parts = interaction.customId.split(':');
        const userId = parts[3];
        const playlistName = parts[4];
        const page = parseInt(parts[5], 10);

        if (userId !== interaction.user.id) {
          await interaction.reply({
            ...buildActionFeedback('Not Allowed', 'You cannot control someone else\'s playlist view.', false),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }

        const playlistCmd = client.commands.get('playlist');
        if (playlistCmd) {
          interaction.options = {
            getSubcommand: () => 'view',
            getString: (key) => key === 'name' ? playlistName : null,
            getInteger: (key) => key === 'page' ? page : null,
          };
          await playlistCmd.execute(interaction, client);
        }
        return;
      }

      // Liked songs pagination: auralyn:liked:page:<userId>:<page>
      if (action === 'liked' && interaction.customId.split(':')[2] === 'page') {
        const parts = interaction.customId.split(':');
        const userId = parts[3];
        const page = parseInt(parts[4], 10);

        if (userId !== interaction.user.id) {
          await interaction.reply({
            ...buildActionFeedback('Not Allowed', 'You cannot control someone else\'s liked songs view.', false),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }

        const likedCmd = client.commands.get('liked');
        if (likedCmd) {
          interaction.options = {
            getInteger: (key) => key === 'page' ? page : null,
          };
          await likedCmd.execute(interaction, client);
        }
        return;
      }

      // Clear liked: auralyn:liked:clear:confirm|cancel:<userId>
      if (action === 'liked' && interaction.customId.split(':')[2] === 'clear') {
        const parts = interaction.customId.split(':');
        const confirmOrCancel = parts[3];
        const userId = parts[4];

        if (userId !== interaction.user.id) {
          await interaction.reply({
            ...buildActionFeedback('Not Allowed', 'You cannot control someone else\'s liked songs.', false),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.deferUpdate();
        try {
          if (confirmOrCancel === 'confirm') {
            const count = await client.likedStore.clearLikedSongs(interaction.user.id);
            await interaction.editReply(buildActionFeedback('Liked Songs Cleared', `Removed **${count}** track${count === 1 ? '' : 's'}.`));
          } else {
            await interaction.editReply(buildActionFeedback('Cancelled', 'Your liked songs were not cleared.'));
          }
        } catch (error) {
          client.logger.error(`Error handling ${interaction.customId}`, error);
          await interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
        }
        return;
      }

      await interaction.deferUpdate();

      const channelId = interaction.channelId;
      const messageId = interaction.message.id;

      try {
        if (action === 'skip') {
          await client.musicPlayer.skip(guildId);
        } else if (action === 'pause') {
          await client.musicPlayer.pause(guildId);
        } else if (action === 'resume') {
          await client.musicPlayer.resume(guildId);
        } else if (action === 'loop') {
          const current = client.musicPlayer.getPlayerState(guildId).loopMode;
          const next = LOOP_CYCLE[current] ?? LOOP_OFF;
          client.musicPlayer.setLoopMode(guildId, next);
          const loopMessages = {
            [LOOP_OFF]:   '🔁 Loop disabled.',
            [LOOP_TRACK]: '🔁 Now looping the current track.',
            [LOOP_QUEUE]: '🔁 Now looping the entire queue.',
          };
          await interaction.followUp({
            ...buildActionFeedback('Loop', loopMessages[next]),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        } else if (action === 'stop') {
          await client.musicPlayer.stop(guildId);
          await patchV2(client, channelId, messageId,
            buildSimpleV2('Auralyn | Playback Stopped', 'Queue cleared and voice session closed.', AuralynColors.success),
            guildId,
          );
          return;
        } else {
          return;
        }

        const state = client.musicPlayer.getPlayerState(guildId);
        if (state.currentTrack) {
          await patchV2(client, channelId, messageId, buildNowPlayingV2(client, guildId), guildId);
        } else {
          await patchV2(client, channelId, messageId,
            buildSimpleV2('Auralyn | Queue Updated', 'Nothing is currently playing. Use `/play` to start a session.', AuralynColors.info),
            guildId,
          );
        }
      } catch (error) {
        client.logger.error(`Error handling button ${interaction.customId}`, error);
        try {
          await patchV2(client, channelId, messageId,
            buildSimpleV2('Auralyn | Controls', 'Auralyn ran into a playback issue while handling that control.', AuralynColors.error),
            guildId,
          );
        } catch { /* ignore secondary failure */ }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      client.logger.warn(`No command matching ${interaction.commandName}`);
      return;
    }

    try {
      client.telemetry?.trackCommand(interaction.commandName);
      client.logger.info(`Handling /${interaction.commandName} in guild ${interaction.guildId ?? 'dm'}`);
      await command.execute(interaction, client, shoukaku);
      client.logger.debug(`Completed /${interaction.commandName}`);
    } catch (error) {
      client.telemetry?.trackError();

      if (error.code === 40060) {
        client.logger.warn(`Duplicate interaction received for /${interaction.commandName} — likely two bot instances running`);
        return;
      }

      client.logger.error(`Error executing /${interaction.commandName}`, error);
      const reply = {
        ...buildActionFeedback('Command Error', 'There was an error executing this command.', false),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      };

      try {
        if (interaction.deferred) {
          await interaction.editReply(reply);
        } else if (interaction.replied) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (replyError) {
        if (replyError.code !== 40060) {
          client.logger.error(`Failed to send error response for /${interaction.commandName}`, replyError);
        }
      }
    }
  },
};
