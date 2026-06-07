const { 
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const fs = require('fs');
const path = require('path');

const controlFile = path.join(__dirname, "control.json");

let control = {
    automod: true,
    xp: true,
    restarting: false,
    status: "online"
};

let adminLogs = [];

function loadControl() {
    try {
        if (fs.existsSync(controlFile)) {
            control = JSON.parse(fs.readFileSync(controlFile, "utf8"));
        }
    } catch (e) {
        console.log("Control file error, resetting.");
    }
}

function saveControl() {
    fs.writeFileSync(controlFile, JSON.stringify(control, null, 2));
}

loadControl();

const express = require("express");
const session = require("express-session");
const passport = require("./auth");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

app.use(passport.initialize());
app.use(passport.session());

app.get("/api/user", (req, res) => {
    if (!req.user) {
        return res.json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.get(
    "/auth/discord",
    passport.authenticate("discord")
);

app.get(
    "/auth/discord/callback",
    passport.authenticate("discord", {
        failureRedirect: "/"
    }),
    (req, res) => {
        res.redirect("/dashboard");
    }
);

app.get("/logout", (req, res) => {
    req.logout(() => {
        res.redirect("/");
    });
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }

    res.redirect("/auth/discord");
}

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Dashboard page
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Bot status API
app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    bot: "GameBlox",
    uptime: process.uptime(),
    servers: 1,
    users: 0
  });
});

app.get("/api/control", (req, res) => {
    res.json({
        xp: control.xp,
        automod: control.automod
    });
});

app.post("/api/restart", (req, res) => {
    const adminIds = [
        "1441223435043868735",
        "1506069255484084354"
    ];

    if (!req.user || !adminIds.includes(req.user.id)) {
        return res.status(403).json({ error: "No access" });
    }

    control.restarting = true;
    control.status = "restarting";

res.json({
    success: true,
    message: "Bot restarting..."
});

setTimeout(() => {
    process.exit(1);
}, 1500);
});

const adminIds = [
    "1441223435043868735",
    "1506069255484084354"
];

function isAdmin(req) {
    return req.user && adminIds.includes(req.user.id);
}

app.post("/api/toggle/automod", (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: "No access" });
    }

    control.automod = !control.automod;
    saveControl();

    res.json({
        success: true,
        automod: control.automod
    });
});

app.post("/api/toggle/xp", (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: "No access" });
    }

    control.xp = !control.xp;
    saveControl();

    res.json({
        success: true,
        xp: control.xp
    });
});

app.get("/api/user", (req, res) => {
  if (!req.user) {
    return res.json({
      loggedIn: false
    });
  }

  const adminIds = [
    "1441223435043868735",
    "1506069255484084354"
  ];

  res.json({
    loggedIn: true,
    id: req.user.id,
    username: req.user.username,
    avatar: req.user.avatar
      ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
      : null,
    isAdmin: adminIds.includes(req.user.id)
  });
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ----------------------
// CLIENT SETUP
// ----------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ----------------------
// DATA SYSTEM
// ----------------------
const dataFile = path.join(__dirname, 'xp.json');
const cooldowns = new Map();

let users = new Map();

function loadData() {
    try {
        if (fs.existsSync(dataFile)) {
            const raw = fs.readFileSync(dataFile, 'utf8');
            const data = JSON.parse(raw || "{}");
            users = new Map(Object.entries(data));
        }
    } catch (err) {
        console.log("⚠️ Data corrupted, resetting.");
        users = new Map();
    }
}

function saveData() {
    const obj = Object.fromEntries(users);
    fs.writeFileSync(dataFile, JSON.stringify(obj, null, 2));
}

function getUser(id) {
    if (!users.has(id)) {
       users.set(id, {
    xp: 0,
    coins: 0,
    lastDaily: 0,
    xpBoostUntil: 0,
    inventory: [],
    level: 0,

    quest: {
        type: "xp",
        progress: 0,
        goal: 100,
        reward: 150,
        completed: false,
        resetTime: 0
    },

    streak: {
        count: 0,
        lastClaim: 0
    },

    // NEW
    warnings: [],
    lastMessages: []
});
    }
    return users.get(id);
}

function resetQuest(user) {
    user.quest = {
        type: "xp",
        progress: 0,
        goal: 100,
        reward: 150,
        completed: false,
        resetTime: Date.now() + 86400000
    };
}

// ----------------------
// LOGGING SYSTEM (NEW)
// ----------------------
async function sendLog(guild, embed) {
    try {
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);
        if (!channel) return;

        channel.send({ embeds: [embed] });
    } catch (err) {
        console.log("Log error:", err);
    }
}

// ----------------------
// AUTOMOD
// ----------------------
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (!control.automod) return;

    const user = getUser(message.author.id);
    const content = message.content.toLowerCase();

    // ======================
    // 🚨 AUTOMOD START
    // ======================

    // BAD WORD FILTER (basic example)
    const badWords = ["fuck", "shit", "bitch", "ass", "asshole", "nigga", "nigger"];

    for (const word of badWords) {
        if (content.includes(word)) {
            message.delete().catch(() => {});

            addWarning(user, `Bad word: ${word}`);
            saveData();

            message.channel.send(`⚠️ <@${message.author.id}> warned for language.`);

            return; // stop XP gain
        }
    }

    // SPAM DETECTION (simple)
    user.lastMessages = user.lastMessages || [];
    user.lastMessages.push(Date.now());

    if (user.lastMessages.length > 5) user.lastMessages.shift();

    if (user.lastMessages.length === 5) {
        const diff = user.lastMessages[4] - user.lastMessages[0];

        if (diff < 4000) {
            message.delete().catch(() => {});

            addWarning(user, "Spam detected");
            saveData();

            message.channel.send(`🚫 <@${message.author.id}> stop spamming.`);
            return;
        }
    }

 // ======================
// 🚨 AUTOMOD END
// ======================
});

// ----------------------
// LEVEL SYSTEM
// ----------------------
function getLevel(xp) {
    return Math.floor(xp / 100);
}


// ----------------------
// XP / COOLDOWN LOGIC (FIXED STRUCTURE)
// ----------------------
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (!control.xp) return;

    const user = getUser(message.author.id);

    const last = cooldowns.get(message.author.id);
    if (last && Date.now() - last < 5000) return;

    cooldowns.set(message.author.id, Date.now());

    let xpGain = Math.floor(Math.random() * 10) + 5;

    if (Date.now() < user.xpBoostUntil) {
        xpGain *= 2;
    }

    // QUEST SYSTEM (kept safe + structured)
    if (!user.quest) resetQuest(user);
    if (Date.now() > user.quest.resetTime) resetQuest(user);

    if (!user.quest.completed && user.quest.type === "xp") {
        user.quest.progress += xpGain;

        if (user.quest.progress >= user.quest.goal) {
            user.quest.completed = true;
            user.coins += user.quest.reward;
        }
    }

    // LEVEL SYSTEM
    const oldLevel = getLevel(user.xp);
    user.xp += xpGain;
    const newLevel = getLevel(user.xp);

    if (newLevel > oldLevel) {
        user.level = newLevel;
        user.coins += newLevel * 25;
    }

    saveData();
});


// =====================================================
// 🆕 MODERATION ADDITIONS (APPENDED ONLY - NOTHING REMOVED)
// =====================================================

// ----------------------
// WARNING SYSTEM HELPERS
// ----------------------
function addWarning(user, reason) {
    user.warnings = user.warnings || 0;
    user.warnHistory = user.warnHistory || [];

    user.warnings += 1;
    user.warnHistory.push({
        reason,
        date: Date.now()
    });

    return user.warnings;
}

function clearWarnings(user) {
    user.warnings = 0;
    user.warnHistory = [];
}
// ----------------------
// SHOP ITEMS
// ----------------------
const shopItems = [
    {
        id: "xp_boost",
        name: "✨ XP Boost",
        price: 100,
        description: "Doubles XP gain for 10 minutes"
    },
    {
        id: "gold_title",
        name: "👑 Gold Title",
        price: 250,
        description: "Cosmetic profile upgrade"
    }
];

// ----------------------
// COMMANDS (APPENDED ONLY)
// ----------------------
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Pong').toJSON(),
    new SlashCommandBuilder()
    .setName("help")
    .setDescription("Open the GameBlox help menu")
    .toJSON(),
    new SlashCommandBuilder().setName('profile').setDescription('Profile').toJSON(),
    new SlashCommandBuilder().setName('level').setDescription('Level').toJSON(),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Leaderboard').toJSON(),
    new SlashCommandBuilder().setName('daily').setDescription('Daily coins').toJSON(),

    new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Shop')
        .addStringOption(o =>
            o.setName('item')
                .setDescription('Item ID')
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your owned items.')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('quest')
        .setDescription('View your daily quest progress.')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason').setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason').setRequired(false)
        )
        .toJSON(),

    // ----------------------
    // 🆕 MODERATION COMMANDS (ADDED ONLY)
    // ----------------------

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason').setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Check warnings of a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Clear warnings of a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('minutes').setDescription('Duration').setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user by ID')
        .addStringOption(o =>
            o.setName('userid').setDescription('User ID').setRequired(true)
        )
        .toJSON(),
];

// ----------------------
// REGISTER COMMANDS
// ----------------------
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ----------------------
// READY
// ----------------------
client.once(Events.ClientReady, c => {
    console.log(`✅ ${c.user.tag} online`);
});

// =====================================================
// COMMAND HANDLER (ONLY ADDITIONS INSIDE)
// =====================================================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const user = getUser(interaction.user.id);

    if (interaction.commandName === 'ping') {
        return interaction.reply('🏓 Pong!');
    }

    if (interaction.commandName === "help") {

    const mainEmbed = new EmbedBuilder()
        .setTitle("🎮 GameBlox Help Center")
        .setDescription("Select a category below to explore commands.")
        .setColor(0x6C5CE7)
        .addFields(
            { name: "📊 Economy", value: "Coins, XP, rewards", inline: true },
            { name: "🛡 Moderation", value: "Admin tools", inline: true },
            { name: "🎮 Fun", value: "Games & entertainment", inline: true },
            { name: "⚙️ Utility", value: "Info & stats", inline: true },
            { name: "🔧 Admin", value: "Bot controls", inline: true }
        )
        .setFooter({ text: "GameBlox Help System" });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("help_economy")
            .setLabel("Economy")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("help_mod")
            .setLabel("Moderation")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("help_fun")
            .setLabel("Fun")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("help_util")
            .setLabel("Utility")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("help_admin")
            .setLabel("Admin")
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
        embeds: [mainEmbed],
        components: [row],
        ephemeral: true
    });
}

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    let embed;

    switch (interaction.customId) {

        case "help_economy":
            embed = new EmbedBuilder()
                .setTitle("📊 Economy Commands")
                .setColor(0x00D2FF)
                .setDescription(`
/balance - Check coins  
/daily - Claim rewards  
/shop - View shop  
/inventory - Your items  
/leaderboard - Top users
                `);
            break;

        case "help_mod":
            embed = new EmbedBuilder()
                .setTitle("🛡 Moderation Commands")
                .setColor(0xFF3B3B)
                .setDescription(`
/kick - Kick user  
/ban - Ban user  
/timeout - Mute user  
/warn - Warn user  
/warnings - View warnings
                `);
            break;

        case "help_fun":
            embed = new EmbedBuilder()
                .setTitle("🎮 Fun Commands")
                .setColor(0x2ECC71)
                .setDescription(`
/coinflip  
/dice  
/8ball  
/meme
                `);
            break;

        case "help_util":
            embed = new EmbedBuilder()
                .setTitle("⚙️ Utility Commands")
                .setColor(0x95A5A6)
                .setDescription(`
/ping  
/userinfo  
/serverinfo  
/uptime  
/botinfo
                `);
            break;

        case "help_admin":
            embed = new EmbedBuilder()
                .setTitle("🔧 Admin Commands")
                .setColor(0xF1C40F)
                .setDescription(`
/toggle automod  
/toggle xp  
/restart
                `);
            break;
    }

    if (embed) {
        await interaction.update({
            embeds: [embed],
            components: []
        });
    }
});

    // ----------------------
    // 🆕 WARN
    // ----------------------
    if (interaction.commandName === 'warn') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';

        const u = getUser(target.id);
        const total = addWarning(u, reason);

        saveData();

        if (total >= 3) {
            const member = await interaction.guild.members.fetch(target.id);
            await member.timeout(10 * 60 * 1000, 'Auto punishment (3 warnings)');
        }

        return interaction.reply(`⚠️ Warned ${target.tag} (${total}/3)`);
    }

    // ----------------------
    // 🆕 WARNINGS LIST
    // ----------------------
    if (interaction.commandName === 'warnings') {
        const target = interaction.options.getUser('user');
        const u = getUser(target.id);

        const list = (u.warnHistory || [])
            .map(w => `• ${w.reason}`)
            .join('\n') || 'No warnings';

        return interaction.reply({
            embeds: [{
                title: `Warnings for ${target.tag}`,
                description: list,
                fields: [
                    { name: 'Total', value: `${u.warnings || 0}` }
                ]
            }]
        });
    }

    // ----------------------
    // 🆕 CLEAR WARNINGS
    // ----------------------
    if (interaction.commandName === 'clearwarns') {
        const target = interaction.options.getUser('user');
        const u = getUser(target.id);

        clearWarnings(u);
        saveData();

        return interaction.reply(`🧹 Cleared warnings for ${target.tag}`);
    }

    // ----------------------
    // 🆕 TIMEOUT
    // ----------------------
    if (interaction.commandName === 'timeout') {
        const target = interaction.options.getUser('user');
        const minutes = interaction.options.getInteger('minutes');

        const member = await interaction.guild.members.fetch(target.id);
        await member.timeout(minutes * 60 * 1000, 'Manual timeout');

        return interaction.reply(`⏱ Timed out ${target.tag} for ${minutes} minutes`);
    }

    // ----------------------
    // 🆕 UNMUTE
    // ----------------------
    if (interaction.commandName === 'unmute') {
        const target = interaction.options.getUser('user');

        const member = await interaction.guild.members.fetch(target.id);
        await member.timeout(null);

        return interaction.reply(`🔓 Unmuted ${target.tag}`);
    }

    // ----------------------
    // 🆕 UNBAN
    // ----------------------
    if (interaction.commandName === 'unban') {
        const userId = interaction.options.getString('userid');

        await interaction.guild.members.unban(userId);

        return interaction.reply(`🔓 Unbanned ${userId}`);
    }

    // (YOUR EXISTING COMMANDS WOULD CONTINUE BELOW — NOT REMOVED)
});

loadData();

client.login(TOKEN);
