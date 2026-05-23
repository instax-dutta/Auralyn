import { Events, MessageFlags, Routes } from 'discord.js';
import { buildActionFeedback, buildNowPlayingV2, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';
import { LOOP_OFF, LOOP_TRACK, LOOP_QUEUE } from '../music/queue.js';

const LOOP_CYCLE = [LOOP_TRACK, LOOP_QUEUE, LOOP_OFF];

function patchV2(client, channelId, messageId, payload) {
  return client.rest.patch(Routes.channelMessage(channelId, messageId), {
    body: {
      flags: payload.flags,
      components: payload.components.map(c => c.toJSON()),
    },
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
          );
          return;
        } else {
          return;
        }

        const state = client.musicPlayer.getPlayerState(guildId);
        if (state.currentTrack) {
          await patchV2(client, channelId, messageId, buildNowPlayingV2(client, guildId));
        } else {
          await patchV2(client, channelId, messageId,
            buildSimpleV2('Auralyn | Queue Updated', 'Nothing is currently playing. Use `/play` to start a session.', AuralynColors.info),
          );
        }
      } catch (error) {
        client.logger.error(`Error handling button ${interaction.customId}`, error);
        try {
          await patchV2(client, channelId, messageId,
            buildSimpleV2('Auralyn | Controls', 'Auralyn ran into a playback issue while handling that control.', AuralynColors.error),
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
