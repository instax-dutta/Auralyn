import { Events } from 'discord.js';
import { buildActionFeedback, buildQueueReply, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client, shoukaku) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('auralyn:')) return;

      const [, action, guildId] = interaction.customId.split(':');
      if (!guildId || guildId !== interaction.guildId) {
        await interaction.reply({
          embeds: [buildActionFeedback('Controls', 'These controls belong to a different server session.', false)],
          ephemeral: true,
        });
        return;
      }

      await interaction.deferUpdate();

      try {
        if (action === 'skip') {
          await client.musicPlayer.skip(guildId);
        } else if (action === 'pause') {
          await client.musicPlayer.pause(guildId);
        } else if (action === 'resume') {
          await client.musicPlayer.resume(guildId);
        } else if (action === 'stop') {
          await client.musicPlayer.stop(guildId);
          await interaction.editReply({
            embeds: [buildActionFeedback('Playback Stopped', 'Queue cleared and voice session closed.')],
            components: [],
          });
          return;
        } else {
          return;
        }

        const state = client.musicPlayer.getPlayerState(guildId);
        if (state.currentTrack) {
          await replyWithPlayerSnapshot(interaction, client, guildId, 'Auralyn | Controls');
        } else {
          await interaction.editReply({
            embeds: [buildActionFeedback('Queue Updated', 'Nothing is currently playing.')],
            components: [],
          });
        }
      } catch (error) {
        client.logger.error(`Error handling button ${interaction.customId}`, error);
        await interaction.editReply({
          embeds: [buildActionFeedback('Controls', 'Auralyn ran into a playback issue while handling that control.', false)],
          components: [],
        });
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
      client.logger.debug(`Handling /${interaction.commandName} in guild ${interaction.guildId ?? 'dm'}`);
      await command.execute(interaction, client, shoukaku);
      client.logger.debug(`Completed /${interaction.commandName}`);
    } catch (error) {
      client.telemetry?.trackError();
      client.logger.error(`Error executing /${interaction.commandName}`, error);
      const reply = {
        embeds: [buildActionFeedback('Command Error', 'There was an error executing this command.', false)],
        ephemeral: true,
      };

      try {
        if (interaction.deferred) {
          await interaction.editReply({ embeds: reply.embeds, components: [] });
        } else if (interaction.replied) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (replyError) {
        client.logger.error(`Failed to send error response for /${interaction.commandName}`, replyError);
      }
    }
  },
};
