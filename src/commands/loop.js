import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle loop mode for the queue')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Loop mode to set')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' }
        )),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    const mode = interaction.options.getString('mode');
    let loopMode;
    switch (mode) {
      case 'off':
        loopMode = 0;
        break;
      case 'track':
        loopMode = 1;
        break;
      case 'queue':
        loopMode = 2;
        break;
      default:
        return interaction.editReply('Invalid loop mode!');
    }

    try {
      client.musicPlayer.setLoopMode(interaction.guildId, loopMode);
      return interaction.editReply(`Loop mode set to: ${mode}`);
    } catch (error) {
      console.error('Error in loop command:', error);
      return interaction.editReply('There was an error while trying to set the loop mode!');
    }
  },
};