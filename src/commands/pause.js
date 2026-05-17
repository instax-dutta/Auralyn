import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    try {
      const paused = await client.musicPlayer.pause(interaction.guildId);
      return interaction.editReply(paused ? 'Paused the current track!' : 'Nothing is currently playing.');
    } catch (error) {
      console.error('Error in pause command:', error);
      return interaction.editReply('There was an error while trying to pause the track!');
    }
  },
};
