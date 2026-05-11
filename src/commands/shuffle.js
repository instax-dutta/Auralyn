import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    try {
      client.musicPlayer.shuffle(interaction.guildId);
      return interaction.editReply('Shuffled the queue!');
    } catch (error) {
      console.error('Error in shuffle command:', error);
      return interaction.editReply('There was an error while trying to shuffle the queue!');
    }
  },
};