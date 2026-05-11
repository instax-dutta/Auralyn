import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    try {
      client.musicPlayer.stop(interaction.guildId);
      // Also, we might want to disconnect the voice connection
      const connection = client.voice.adapterCreator ? client.voice.connections.get(interaction.guildId) : null;
      if (connection) {
        connection.disconnect();
      }
      return interaction.editReply('Stopped the music and cleared the queue!');
    } catch (error) {
      console.error('Error in stop command:', error);
      return interaction.editReply('There was an error while trying to stop the music!');
    }
  },
};