import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Interaction, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { storage } from './storage';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

// Using the provided token from the user
const BOT_TOKEN = process.env.DISCORD_TOKEN || "MTQ3NTM2MjM1MTUzOTU1NjUwNg.GKC34l.vDrxP8Um3aBl2otFL2q1yOWe1KgCGD6K5LifF0";

const DEPARTMENTS = [
  "New York State Police",
  "East Greenbush Police Department",
  "East Greenbush Fire Department",
  "New York Department of Transportation"
];

const REQUIRED_ROLE = "Public Services Employee";
const MANAGEMENT_ROLE = "Management Team";

const commands = [
  new SlashCommandBuilder()
    .setName('shiftmanage')
    .setDescription('Manage your shift')
];

export async function setupBot() {
  if (!BOT_TOKEN) {
    console.error("No Discord token provided.");
    return;
  }

  client.on('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
      console.log('Started refreshing global application (/) commands.');
      await rest.put(
        Routes.applicationCommands(client.user!.id),
        { body: commands },
      );
      console.log('Successfully reloaded global application (/) commands.');
    } catch (error) {
      console.error('Error reloading commands:', error);
    }
  });

  // Handle errors
  client.on('error', console.error);
  process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'shiftmanage') {
        const member = interaction.member as any;
        const hasRole = member?.roles?.cache?.some((role: any) => role.name === REQUIRED_ROLE || role.name === MANAGEMENT_ROLE);
        const isOwner = interaction.user.id === interaction.guild?.ownerId;
        const isAdmin = member?.permissions?.has('Administrator');
        
        if (!hasRole && !isAdmin && !isOwner) {
          return interaction.reply({ content: 'You do not have permission to use this command. You need the "Public Services Employee" role.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle("Shift Management")
          .setDescription("Select an option below to manage your shift. \n\nRemember to Start Shift when you go on duty and End Shift when you go off duty.")
          .setColor(0x0099FF);

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('start_shift')
              .setLabel('Start Shift')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('end_shift')
              .setLabel('End Shift')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('leaderboard')
              .setLabel('Leaderboard')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('reset_shift')
              .setLabel('Reset Shifts')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({ embeds: [embed], components: [row] });
      }
    } else if (interaction.isButton()) {
      const discordId = interaction.user.id;
      const username = interaction.user.username;
      
      let user = await storage.getUserByDiscordId(discordId);
      if (!user) {
        user = await storage.createUser(discordId, username);
      }

      if (interaction.customId === 'start_shift') {
        const active = await storage.getActiveShift(discordId);
        if (active) {
          return interaction.reply({ content: "You already have an active shift!", ephemeral: true });
        }

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_department')
              .setPlaceholder('Select your department')
              .addOptions(DEPARTMENTS.map(dep => ({
                label: dep,
                value: dep
              })))
          );

        await interaction.reply({ content: "Please select your department to start the shift:", components: [row], ephemeral: true });
      } else if (interaction.customId === 'end_shift') {
        try {
          const shift = await storage.endShift(discordId);
          await interaction.reply({ content: `Shift ended successfully! Duration: ${shift.durationMinutes} minutes.`, ephemeral: true });
        } catch (e: any) {
          await interaction.reply({ content: e.message || "Failed to end shift.", ephemeral: true });
        }
      } else if (interaction.customId === 'leaderboard') {
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_leaderboard_department')
              .setPlaceholder('Select department for leaderboard')
              .addOptions([
                { label: 'Global (All)', value: 'all' },
                ...DEPARTMENTS.map(dep => ({
                  label: dep,
                  value: dep
                }))
              ])
          );

        await interaction.reply({ content: "Which department's leaderboard would you like to view?", components: [row], ephemeral: true });
      } else if (interaction.customId === 'reset_shift') {
        const member = interaction.member as any;
        const hasRole = member?.roles?.cache?.some((role: any) => role.name === MANAGEMENT_ROLE);
        const isAdmin = member?.permissions?.has('Administrator');
        const isOwner = interaction.user.id === interaction.guild?.ownerId;
        
        if (!hasRole && !isAdmin && !isOwner) {
          return interaction.reply({ content: 'Only Management Team can reset shifts.', ephemeral: true });
        }
        await storage.resetLeaderboard();
        await interaction.reply({ content: "All shift data has been reset.", ephemeral: true });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_department') {
        const department = interaction.values[0];
        const discordId = interaction.user.id;
        
        const active = await storage.getActiveShift(discordId);
        if (active) {
          return interaction.reply({ content: "You already have an active shift!", ephemeral: true });
        }
        
        await storage.startShift(discordId, department);
        await interaction.reply({ content: `Shift started successfully for department **${department}**! Stay safe out there.`, ephemeral: true });
      } else if (interaction.customId === 'select_leaderboard_department') {
        const department = interaction.values[0] === 'all' ? undefined : interaction.values[0];
        const lb = await storage.getLeaderboard(department);
        const top10 = lb.slice(0, 10);
        let text = top10.map((entry, i) => `${i + 1}. **${entry.username}** - ${entry.totalDuration} mins`).join('\n');
        if (!text) text = "No shift data yet.";
        
        const embed = new EmbedBuilder()
          .setTitle(`${department || 'Global'} Shift Leaderboard`)
          .setDescription(text)
          .setColor(0xFFD700);
          
        await interaction.reply({ embeds: [embed] });
      }
    }
  });

  await client.login(BOT_TOKEN);
}