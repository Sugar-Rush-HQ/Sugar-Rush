require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, PermissionsBitField, REST, Routes, ActivityType 
} = require('discord.js');
const mongoose = require('mongoose');

// --- 1. CONFIGURATION ---
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const BRAND_NAME = "Sugar Rush";
const BRAND_COLOR = 0xFFA500; // Orange
const ERROR_COLOR = 0xFF0000; // Red
const SUCCESS_COLOR = 0x2ECC71; // Green
const SUPPORT_SERVER_LINK = "https://discord.gg/ceT3Gqwquj";
const SUPPORT_SERVER_ID = '1454857011866112063';

// --- IDs ---
const ROLES = {
    COOK: '1454877400729911509',
    DELIVERY: '1454877287953469632',
    MANAGER: '1454876343878549630',
    OWNER: '662655499811946536',
    SENIOR_COOK: '0', 
    SENIOR_DELIVERY: '0',
    BYPASS: '1454936082591252534',
    VIP: '1454935878408605748'
};

const CHANNELS = {
    COOK: '1454879418999767122',
    DELIVERY: '1454880879741767754',
    WARNING: '1454881451161026637',
    VACATION: '1454909580894015754',
    BACKUP: '1454888266451910901',
    RATINGS: '1454884136740327557',
    COMPLAINT: '1454886383662665972',
    QUOTA: '1454895987322519672',
    LOGS: '1455092188626292852'
};

// --- 2. DATABASE SCHEMAS ---
const orderSchema = new mongoose.Schema({
    order_id: String,
    user_id: String,
    guild_id: String,
    channel_id: String,
    status: { type: String, default: 'pending' },
    item: String,
    is_vip: Boolean,
    created_at: { type: Date, default: Date.now },
    chef_name: String,
    deliverer_id: String,
    claimed_at: Date,
    ready_at: Date,
    images: [String],
    rating: Number,
    backup_msg_id: String
});

const userSchema = new mongoose.Schema({
    user_id: String,
    cook_count_week: { type: Number, default: 0 },
    cook_count_total: { type: Number, default: 0 },
    deliver_count_week: { type: Number, default: 0 },
    deliver_count_total: { type: Number, default: 0 },
    quota_fails_cook: { type: Number, default: 0 },
    quota_fails_deliver: { type: Number, default: 0 },
    warnings: { type: Number, default: 0 },
    warning_history: [{ 
        reason: String, 
        moderator: String, 
        date: { type: Date, default: Date.now } 
    }],
    is_banned: { type: Number, default: 0 },
    ban_expires_at: Date
});

const premiumSchema = new mongoose.Schema({
    user_id: String,
    is_vip: Boolean,
    expires_at: Date
});

const codeSchema = new mongoose.Schema({
    code: String,
    status: { type: String, default: 'unused' },
    created_by: String
});

const vacationSchema = new mongoose.Schema({
    user_id: String,
    status: String,
    end_date: Date
});

const scriptSchema = new mongoose.Schema({
    user_id: String,
    script: String
});

const configSchema = new mongoose.Schema({
    key: String,
    date: Date
});

const serverBlacklistSchema = new mongoose.Schema({
    guild_id: String,
    reason: String,
    banned_by: String,
    date: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const User = mongoose.model('User', userSchema);
const PremiumUser = mongoose.model('PremiumUser', premiumSchema);
const PremiumCode = mongoose.model('PremiumCode', codeSchema);
const Vacation = mongoose.model('Vacation', vacationSchema);
const Script = mongoose.model('Script', scriptSchema);
const Config = mongoose.model('Config', configSchema);
const ServerBlacklist = mongoose.model('ServerBlacklist', serverBlacklistSchema);

// --- 3. CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel],
    presence: {
        status: 'online',
        activities: [{ name: '/order | Sugar Rush', type: ActivityType.Playing }]
    }
});

// --- 4. HELPER FUNCTIONS ---
const getGlobalPerms = async (userId) => {
    if (userId === ROLES.OWNER) return { isStaff: true, isManager: true, isCook: true, isDelivery: true, isOwner: true };
    try {
        const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);
        if (!supportGuild) return { isStaff: false, isManager: false, isOwner: false }; 
        const member = await supportGuild.members.fetch(userId);
        const isCook = member.roles.cache.has(ROLES.COOK);
        const isDelivery = member.roles.cache.has(ROLES.DELIVERY);
        const isManager = member.roles.cache.has(ROLES.MANAGER);
        return { 
            isStaff: isCook || isDelivery || isManager, 
            isManager: isManager, 
            isCook: isCook, 
            isDelivery: isDelivery,
            isOwner: false
        };
    } catch (e) {
        return { isStaff: false, isManager: false, isOwner: false };
    }
};

const createEmbed = (title, description, color = BRAND_COLOR, fields = []) => {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || null)
        .setColor(color)
        .setFooter({ text: BRAND_NAME, iconURL: client.user?.displayAvatarURL() })
        .setTimestamp();
    if (fields.length > 0) embed.addFields(fields);
    return embed;
};

const logToAdminChannel = async (embed) => {
    try {
        const channel = await client.channels.fetch(CHANNELS.LOGS).catch(() => null);
        if (channel) await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error("Failed to log to admin channel", e);
    }
};

const updateMasterLog = async (orderId) => {
    try {
        const channel = await client.channels.fetch(CHANNELS.BACKUP).catch(() => null);
        if (!channel) return;
        const o = await Order.findOne({ order_id: orderId });
        if (!o) return;

        const guild = client.guilds.cache.get(o.guild_id);
        const serverName = guild ? guild.name : "Unknown Server";

        const embed = new EmbedBuilder()
            .setTitle(`🍩 Order #${o.order_id}`)
            .setColor(BRAND_COLOR)
            .addFields(
                { name: 'Status', value: `**${o.status.toUpperCase()}**`, inline: true },
                { name: 'Item', value: o.item, inline: true },
                { name: 'Client', value: `<@${o.user_id}>\n(ID: ${o.user_id})`, inline: true },
                { name: 'Origin Server', value: `${serverName}\n(ID: ${o.guild_id})`, inline: true },
                { name: 'Chef', value: o.chef_name || 'None', inline: true },
                { name: 'Deliverer', value: o.deliverer_id ? `<@${o.deliverer_id}>` : 'None', inline: true }
            )
            .setTimestamp();

        // --- NEW: IMAGE LOGGING LOGIC ---
        if (o.images && o.images.length > 0) {
            // Set the first image as the main preview
            embed.setImage(o.images[0]);
            
            // Create a clickable list of ALL images
            const linkList = o.images.map((url, index) => `[Image ${index + 1}](${url})`).join(' | ');
            embed.addFields({ name: 'Proof/Attachments', value: linkList });
        }

        if (!o.backup_msg_id) {
            const msg = await channel.send({ embeds: [embed] });
            o.backup_msg_id = msg.id;
            await o.save();
        } else {
            const msg = await channel.messages.fetch(o.backup_msg_id).catch(() => null);
            if (msg) await msg.edit({ embeds: [embed] });
        }
    } catch (e) { console.error(e); }
};

const generateCode = () => `VIP-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

// --- NEW: ETA CALCULATION ---
const calculateETA = async () => {
    const queueSize = await Order.countDocuments({ status: { $in: ['pending', 'claimed', 'cooking', 'ready'] } });
    let totalStaff = 0;
    try {
        const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);
        if (supportGuild) {
            await supportGuild.members.fetch(); 
            const cooks = supportGuild.roles.cache.get(ROLES.COOK)?.members.size || 0;
            const drivers = supportGuild.roles.cache.get(ROLES.DELIVERY)?.members.size || 0;
            totalStaff = cooks + drivers;
        }
    } catch (e) { totalStaff = 5; }

    if (totalStaff === 0) return "Indefinite (No Staff Online)";
    if (totalStaff <= 10) return "**2 - 6 Hours** (High Volume / Low Staff)";

    const minutes = Math.ceil(((queueSize + 1) * 40) / totalStaff);
    if (minutes < 15) return "15 - 30 Minutes"; 
    if (minutes > 120) return `${Math.ceil(minutes/60)} Hours`;
    return `${minutes} Minutes`;
};

// --- 5. EVENTS ---

client.once('clientReady', async () => {
    console.log(`🚀 ${BRAND_NAME} is ONLINE as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: '/order | Sugar Rush', type: ActivityType.Playing }], status: 'online' });

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");
    } catch (e) { console.error("❌ MongoDB Error:", e); }

    // --- COMMAND DEFINITIONS ---
    const commands = [
        { name: 'order', description: 'Order food', options: [{ name: 'item', type: 3, required: true, description: 'Item' }] },
        { name: 'orderstatus', description: 'Check the status and ETA of your active order' },
        { name: 'claim', description: 'Claim order', options: [{ name: 'id', type: 3, required: true, description: 'ID' }] },
        { 
            name: 'cook', 
            description: 'Cook order', 
            options: [
                { name: 'id', type: 3, required: true, description: 'ID' }, 
                { name: 'link', type: 3, required: false, description: 'Image Link (Priority)' },
                { name: 'image', type: 11, required: false, description: 'Or Upload Proof 1' },
                { name: 'image2', type: 11, required: false, description: 'Or Upload Proof 2' },
                { name: 'image3', type: 11, required: false, description: 'Or Upload Proof 3' }
            ] 
        },
        { name: 'deliver', description: 'Deliver order', options: [{ name: 'id', type: 3, required: true, description: 'ID' }] },
        { name: 'setscript', description: 'Set delivery message', options: [{ name: 'message', type: 3, required: true, description: 'Script' }] },
        { name: 'invite', description: 'Get invite link' },
        { name: 'support', description: 'Get link to support server' },
        { name: 'help', description: 'Show available commands' },
        { name: 'warn', description: 'Warn user', options: [{ name: 'id', type: 3, required: true, description: 'ID' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'fdo', description: 'Force delete order', options: [{ name: 'id', type: 3, required: true, description: 'ID' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'force_warn', description: 'Manager: Warn user (Post-Delivery)', options: [{ name: 'id', type: 3, required: true, description: 'Order ID' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'unban', description: 'Unban user', options: [{ name: 'user', type: 6, required: true, description: 'User' }] },
        { name: 'rules', description: 'View rules' },
        { name: 'generate_codes', description: 'Owner: Gen Codes', options: [{ name: 'amount', type: 4, required: true, description: 'Amount' }] },
        { name: 'redeem', description: 'Redeem VIP', options: [{ name: 'code', type: 3, required: true, description: 'Code' }] },
        { name: 'addvip', description: 'Owner: Give VIP', options: [{ name: 'user_input', type: 3, required: true, description: 'User ID or Ping' }] },
        { name: 'removevip', description: 'Owner: Revoke VIP', options: [{ name: 'user_input', type: 3, required: true, description: 'User ID or Ping' }] },
        { name: 'vacation', description: 'Request vacation', options: [{ name: 'days', type: 4, required: true, description: 'Days' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'quota', description: 'Check your current quota status' },
        { name: 'stats', description: 'Check staff stats (Rating, Totals)', options: [{ name: 'user', type: 6, required: false, description: 'User' }] },
        { name: 'rate', description: 'Rate service', options: [{ name: 'id', type: 3, required: true, description: 'ID' }, { name: 'stars', type: 4, required: true, description: '1-5' }] },
        { name: 'complain', description: 'Complaint', options: [{ name: 'id', type: 3, required: true, description: 'ID' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'orderlist', description: 'View queue' },
        { name: 'unclaim', description: 'Drop order', options: [{ name: 'id', type: 3, required: true, description: 'ID' }] },
        { name: 'runquota', description: 'Manager: Force Run Quota' },
        { name: 'blacklist_server', description: 'Block a server from ordering', options: [{ name: 'server_id', type: 3, required: true, description: 'Guild ID' }, { name: 'reason', type: 3, required: true, description: 'Reason' }] },
        { name: 'unblacklist_server', description: 'Unblock a server', options: [{ name: 'server_id', type: 3, required: true, description: 'Guild ID' }] }
    ];

    // --- COMMAND SYNCER FUNCTION ---
    const syncCommands = async () => {
        try {
            console.log("⏳ Refreshing application (/) commands...");
            const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log("✅ Successfully reloaded application (/) commands.");
        } catch (error) {
            console.error("❌ Command Sync Error:", error);
        }
    };

    // 1. Run immediately on start
    await syncCommands();

    // 2. Run every 12 Hours
    setInterval(syncCommands, 12 * 60 * 60 * 1000);
    
    // Status Heartbeat
    setInterval(() => {
        client.user.setPresence({ activities: [{ name: '/order | Sugar Rush', type: ActivityType.Playing }], status: 'online' });
    }, 300000); 

    setInterval(checkTasks, 60000);
});

// --- 6. AUTOMATED SYSTEMS ---

async function checkTasks() {
    const now = new Date();

    // 1. Auto Delivery
    const threshold = new Date(now - 20 * 60000);
    const overdue = await Order.find({ status: 'ready', ready_at: { $lt: threshold } });
    
    for (const o of overdue) {
        try {
            const guild = client.guilds.cache.get(o.guild_id);
            if (guild) {
                const channel = guild.channels.cache.get(o.channel_id);
                if (channel) {
                    const embed = createEmbed(
                        "📦 Special Delivery Arrived!",
                        `**Chef:** ${o.chef_name}\n\nHere is your order! To ensure you get your treats while they are fresh, our express courier system has dropped this off for you.\n\n*Thank you for choosing ${BRAND_NAME}! 🍩*`,
                        BRAND_COLOR
                    );
                    if(o.images && o.images.length > 0) embed.setImage(o.images[0]);
                    
                    await channel.send({ content: `<@${o.user_id}>`, embeds: [embed] });
                    if(o.images.length > 1) await channel.send({ files: o.images.slice(1) });
                    
                    o.status = 'delivered';
                    o.deliverer_id = 'AUTO_BOT';
                    await o.save();
                    updateMasterLog(o.order_id);
                }
            }
        } catch(e) { console.error("Auto-Deliver Failed:", e); }
    }

    // 2. VIP Expiry Monitor
    const expiredVips = await PremiumUser.find({ is_vip: true, expires_at: { $lt: now } });
    for (const v of expiredVips) {
        v.is_vip = false; v.expires_at = null; await v.save();
        try {
            const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);
            if (supportGuild) {
                const member = await supportGuild.members.fetch(v.user_id).catch(() => null);
                if (member) await member.roles.remove(ROLES.VIP).catch(() => {});
            }
        } catch (e) {}
    }

    // 3. Weekly Quota
    if (now.getUTCDay() === 0 && now.getUTCHours() === 23) {
        const lastRun = await Config.findOne({ key: 'last_quota_run' });
        const twelveHours = 12 * 60 * 60 * 1000;
        if (!lastRun || (now - lastRun.date) > twelveHours) {
            for (const [id, guild] of client.guilds.cache) {
                await runQuotaLogic(guild);
            }
            await Config.findOneAndUpdate({ key: 'last_quota_run' }, { date: now }, { upsert: true });
        }
    }
}

const calculateTargets = (volume, staffCount) => {
    if (staffCount === 0) return { norm: 0, senior: 0 };
    let raw = Math.ceil(volume / staffCount);
    let norm = Math.min(raw, 30);
    let senior = Math.ceil(norm / 2);
    if (volume > 0) { norm = Math.max(1, norm); senior = Math.max(1, senior); }
    return { norm, senior };
};

async function runQuotaLogic(guild) {
    const quotaChannel = guild.channels.cache.get(CHANNELS.QUOTA);
    if (!quotaChannel) return;

    const cookRole = guild.roles.cache.get(ROLES.COOK);
    const delRole = guild.roles.cache.get(ROLES.DELIVERY);
    if(!cookRole || !delRole) return;
    await guild.members.fetch(); 

    const cooks = cookRole.members.map(m => m);
    const deliverers = delRole.members.map(m => m);

    const allUsers = await User.find({});
    let totalCook = 0; let totalDel = 0;
    
    for (const m of cooks) { const u = allUsers.find(u => u.user_id === m.id); if(u) totalCook += u.cook_count_week; }
    for (const m of deliverers) { const u = allUsers.find(u => u.user_id === m.id); if(u) totalDel += u.deliver_count_week; }

    const cTarget = calculateTargets(totalCook, cooks.length);
    const dTarget = calculateTargets(totalDel, deliverers.length);

    let report = `📊 **Weekly Quota Report**\n🍩 Total Cooked: ${totalCook} | 🚴 Total Delivered: ${totalDel}\n**Targets:** Normal \`${cTarget.norm}\` | Senior \`${cTarget.senior}\`\n\n`;

    report += `__**👨‍🍳 Kitchen Staff**__\n`;
    for (const m of cooks) {
        const u = await User.findOne({ user_id: m.id }) || new User({ user_id: m.id });
        const isSenior = m.roles.cache.has(ROLES.SENIOR_COOK);
        const target = isSenior ? cTarget.senior : cTarget.norm;
        const done = u.cook_count_week;
        const isBypass = m.roles.cache.has(ROLES.BYPASS);

        if (isBypass) {
            report += `🛡️ <@${m.id}>: Exempt\n`;
        } else if (done >= target) {
            u.quota_fails_cook = 0; report += `✅ <@${m.id}>: ${done}/${target}\n`;
        } else {
            u.quota_fails_cook += 1;
            if (u.quota_fails_cook >= 2) { m.roles.remove(ROLES.COOK).catch(()=>{}); u.quota_fails_cook = 0; report += `❌ <@${m.id}>: ${done}/${target} (**REMOVED**)\n`; }
            else { report += `⚠️ <@${m.id}>: ${done}/${target} (Strike ${u.quota_fails_cook}/2)\n`; }
        }
        u.cook_count_week = 0; await u.save();
    }

    report += `\n__**🚴 Delivery Staff**__\n`;
    for (const m of deliverers) {
        const u = await User.findOne({ user_id: m.id }) || new User({ user_id: m.id });
        const isSenior = m.roles.cache.has(ROLES.SENIOR_DELIVERY);
        const target = isSenior ? dTarget.senior : dTarget.norm;
        const done = u.deliver_count_week;
        const isBypass = m.roles.cache.has(ROLES.BYPASS);

        if (isBypass) {
            report += `🛡️ <@${m.id}>: Exempt\n`;
        } else if (done >= target) {
            u.quota_fails_deliver = 0; report += `✅ <@${m.id}>: ${done}/${target}\n`;
        } else {
            u.quota_fails_deliver += 1;
            if (u.quota_fails_deliver >= 2) { m.roles.remove(ROLES.DELIVERY).catch(()=>{}); u.quota_fails_deliver = 0; report += `❌ <@${m.id}>: ${done}/${target} (**REMOVED**)\n`; }
            else { report += `⚠️ <@${m.id}>: ${done}/${target} (Strike ${u.quota_fails_deliver}/2)\n`; }
        }
        u.deliver_count_week = 0; await u.save();
    }

    const embed = createEmbed("📊 Weekly Quota Report", report.substring(0, 4000), BRAND_COLOR);
    await quotaChannel.send({ embeds: [embed] });
}

// --- 7. INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    const perms = await getGlobalPerms(interaction.user.id);

    // --- 7A. CHANNEL & SERVER RESTRICTIONS ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // HELP COMMAND (SMART LISTING)
        if (commandName === 'help') {
            const isSupport = interaction.guildId === SUPPORT_SERVER_ID;
            const isKitchen = interaction.channelId === CHANNELS.COOK;
            const isDelivery = interaction.channelId === CHANNELS.DELIVERY;
            const visibleCommands = [];

            // 1. PUBLIC COMMANDS
            visibleCommands.push('**/order** - Order food');
            visibleCommands.push('**/orderstatus** - Check your order');
            visibleCommands.push('**/rules** - View rules');
            visibleCommands.push('**/invite** - Invite bot');
            visibleCommands.push('**/support** - Get help');
            visibleCommands.push('**/rate** - Rate service');
            visibleCommands.push('**/complain** - File complaint');
            visibleCommands.push('**/redeem** - Redeem VIP code');

            // 2. KITCHEN COMMANDS
            if ((perms.isStaff && (isKitchen || isSupport)) || perms.isManager || perms.isOwner) {
                const note = (isKitchen || perms.isManager || perms.isOwner) ? "" : " *(Kitchen Channel Only)*";
                visibleCommands.push(`**/claim** - Claim an order${note}`);
                visibleCommands.push(`**/cook** - Start cooking${note}`);
                visibleCommands.push(`**/setscript** - Set delivery message`);
            }

            // 3. DELIVERY COMMANDS
            if ((perms.isStaff && (isDelivery || isSupport)) || perms.isManager || perms.isOwner) {
                const note = (isDelivery || perms.isManager || perms.isOwner) ? "" : " *(Delivery Channel Only)*";
                visibleCommands.push(`**/deliver** - Deliver order${note}`);
                const listNote = (isKitchen || isDelivery || perms.isManager || perms.isOwner) ? "" : " *(Kitchen/Delivery Only)*";
                visibleCommands.push(`**/orderlist** - View queue${listNote}`);
            }

            // 4. SUPPORT SERVER COMMANDS
            if ((perms.isStaff && isSupport) || perms.isOwner) {
                visibleCommands.push('**/vacation** - Request time off');
                visibleCommands.push('**/quota** - Check weekly quota');
                visibleCommands.push('**/stats** - View staff stats');
            }

            // 5. MANAGER COMMANDS
            if ((perms.isManager && isSupport) || perms.isOwner) {
                visibleCommands.push('\n__**Manager Commands**__');
                visibleCommands.push('**/warn** - Warn user');
                visibleCommands.push('**/fdo** - Force delete order');
                visibleCommands.push('**/force_warn** - Warn (Post-Delivery)');
                visibleCommands.push('**/unban** - Unban user');
                visibleCommands.push('**/unclaim** - Force unclaim order');
                visibleCommands.push('**/runquota** - Force quota check');
            }

            // 6. OWNER COMMANDS
            if (perms.isOwner) {
                visibleCommands.push('\n__**Owner Commands**__');
                visibleCommands.push('**/addvip** - Give VIP');
                visibleCommands.push('**/removevip** - Remove VIP');
                visibleCommands.push('**/generate_codes** - Create VIP codes');
                visibleCommands.push('**/blacklist_server** - Ban server');
                visibleCommands.push('**/unblacklist_server** - Unban server');
            }

            const embed = createEmbed("🍩 Available Commands", visibleCommands.join('\n'), BRAND_COLOR)
                .setFooter({ text: `Context: ${interaction.guild.name} | Showing commands available to you.` });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ... [REST OF COMMAND LOGIC] ...
        if (['claim', 'cook'].includes(commandName)) {
            if (interaction.channelId !== CHANNELS.COOK && !perms.isManager && !perms.isOwner) {
                return interaction.reply({ embeds: [createEmbed("❌ Wrong Channel", `Please use this command in <#${CHANNELS.COOK}>.`, ERROR_COLOR)], ephemeral: true });
            }
        }

        if (commandName === 'deliver') {
            if (interaction.channelId !== CHANNELS.DELIVERY && !perms.isManager && !perms.isOwner) {
                return interaction.reply({ embeds: [createEmbed("❌ Wrong Channel", `Please use this command in <#${CHANNELS.DELIVERY}>.`, ERROR_COLOR)], ephemeral: true });
            }
        }

        const restrictedCommands = ['warn', 'fdo', 'force_warn', 'unban', 'vacation', 'quota', 'stats', 'runquota', 'addvip', 'removevip', 'generate_codes', 'setscript', 'orderlist', 'blacklist_server', 'unblacklist_server'];
        if (restrictedCommands.includes(commandName)) {
            if (interaction.guildId !== SUPPORT_SERVER_ID && !perms.isOwner) {
                return interaction.reply({ embeds: [createEmbed("❌ Restricted", "This command can only be used in the **Support Server**.", ERROR_COLOR)], ephemeral: true });
            }
        }
        
        if (['addvip', 'removevip', 'generate_codes', 'blacklist_server', 'unblacklist_server'].includes(commandName)) {
            if (!perms.isOwner) {
                return interaction.reply({ embeds: [createEmbed("❌ Restricted", "This command is restricted to the **Bot Owner**.", ERROR_COLOR)], ephemeral: true });
            }
        }
    }

    // --- 7B. BUTTON & MODAL HANDLING ---
    if (interaction.isButton()) {
        if (!perms.isManager && !perms.isOwner) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Managers only.", ERROR_COLOR)], ephemeral: true });
        
        const [action, userId, daysStr] = interaction.customId.split('_');
        const days = parseInt(daysStr);

        if (action === 'vacApprove') {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);
            await Vacation.findOneAndUpdate({ user_id: userId }, { status: 'active', end_date: endDate }, { upsert: true });
            const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);
            if(supportGuild) {
                const target = await supportGuild.members.fetch(userId).catch(() => null);
                if (target) target.roles.add(ROLES.BYPASS).catch(() => {});
            }
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(SUCCESS_COLOR).setFooter({ text: `Approved by ${interaction.user.username}` });
            await interaction.message.edit({ embeds: [embed], components: [] });
            await interaction.reply({ embeds: [createEmbed("✅ Approved", `Vacation approved.`, SUCCESS_COLOR)], ephemeral: true });
        }

        if (action === 'vacEdit') {
            const modal = new ModalBuilder().setCustomId(`vacModalEdit_${userId}`).setTitle("Edit Vacation Duration");
            const input = new TextInputBuilder().setCustomId('newDays').setLabel('New Duration (Days)').setStyle(TextInputStyle.Short);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (action === 'vacDeny') {
            const modal = new ModalBuilder().setCustomId(`vacModalDeny_${userId}`).setTitle("Deny Vacation Request");
            const input = new TextInputBuilder().setCustomId('denyReason').setLabel('Reason for Denial').setStyle(TextInputStyle.Paragraph);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        const [action, userId] = interaction.customId.split('_');

        if (action === 'vacModalEdit') {
            const newDays = parseInt(interaction.fields.getTextInputValue('newDays'));
            if (isNaN(newDays) || newDays < 1 || newDays > 14) return interaction.reply({ embeds: [createEmbed("❌ Error", "Days must be 1-14.", ERROR_COLOR)], ephemeral: true });
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + newDays);
            await Vacation.findOneAndUpdate({ user_id: userId }, { status: 'active', end_date: endDate }, { upsert: true });
            const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);
            if(supportGuild) {
                const target = await supportGuild.members.fetch(userId).catch(() => null);
                if (target) target.roles.add(ROLES.BYPASS).catch(() => {});
            }
            const oldEmbed = interaction.message.embeds[0];
            const embed = EmbedBuilder.from(oldEmbed).setColor(SUCCESS_COLOR).setDescription(oldEmbed.description.replace(/Duration: \d+ Days/, `Duration: ${newDays} Days (Edited)`)).setFooter({ text: `Approved (Edited) by ${interaction.user.username}` });
            await interaction.message.edit({ embeds: [embed], components: [] });
            await interaction.reply({ embeds: [createEmbed("✅ Approved & Edited", `Vacation set to ${newDays} days.`, SUCCESS_COLOR)], ephemeral: true });
        }

        if (action === 'vacModalDeny') {
            const reason = interaction.fields.getTextInputValue('denyReason');
            const oldEmbed = interaction.message.embeds[0];
            const embed = EmbedBuilder.from(oldEmbed).setColor(ERROR_COLOR).addFields({ name: "Denial Reason", value: reason }).setFooter({ text: `Denied by ${interaction.user.username}` });
            await interaction.message.edit({ embeds: [embed], components: [] });
            await interaction.reply({ embeds: [createEmbed("❌ Request Denied", "User has been notified.", SUCCESS_COLOR)], ephemeral: true });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // --- ORDER ---
    if (commandName === 'order') {
        const item = interaction.options.getString('item');
        const oid = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const blacklist = await ServerBlacklist.findOne({ guild_id: interaction.guild.id });
        if (blacklist) {
            const embed = createEmbed("🛑 Action Blocked", `This server is **Blacklisted** from using Sugar Rush services.\n\n**Reason:** ${blacklist.reason}\n\n*Please contact support via `/support` if you believe this is an error.*`, ERROR_COLOR);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const u = await User.findOne({ user_id: interaction.user.id });
        if(u && u.is_banned) return interaction.reply({ embeds: [createEmbed("🛑 Action Blocked", "You are permanently banned.", ERROR_COLOR)], ephemeral: true });
        
        const active = await Order.findOne({ user_id: interaction.user.id, status: { $in: ['pending', 'claimed', 'cooking', 'ready'] } });
        if (active) return interaction.reply({ embeds: [createEmbed("❌ Order Failed", "You already have an active order in the queue.", ERROR_COLOR)], ephemeral: true });

        const vipUser = await PremiumUser.findOne({ user_id: interaction.user.id, is_vip: true });
        const isVip = !!vipUser;

        const eta = await calculateETA(); // Calculate ETA

        await new Order({
            order_id: oid, user_id: interaction.user.id, guild_id: interaction.guild.id,
            channel_id: interaction.channel.id, item: item, is_vip: isVip
        }).save();

        updateMasterLog(oid);
        const channel = client.channels.cache.get(CHANNELS.COOK);
        if(channel) {
            const ping = isVip ? "@here" : "";
            const title = isVip ? "💎 VIP ORDER!" : "🍩 New Order!";
            const embed = createEmbed(title, `**Item:** ${item}\n**User:** <@${interaction.user.id}>\n**ID:** \`${oid}\``, isVip ? 0x9B59B6 : BRAND_COLOR);
            channel.send({ content: ping, embeds: [embed] });
        }
        
        const replyEmbed = createEmbed("✅ Order Placed", `Your order ID is \`${oid}\`. Sit tight!`, SUCCESS_COLOR)
            .addFields(
                { name: "Estimated Delivery", value: eta },
                { name: "Disclaimer", value: "*Times are estimates and not guaranteed. Delays may occur based on staff availability.*" }
            );
        await interaction.reply({ embeds: [replyEmbed], ephemeral: true });
    }

    // --- ORDER STATUS (UPDATED LOGIC) ---
    if (commandName === 'orderstatus') {
        const order = await Order.findOne({ user_id: interaction.user.id, status: { $in: ['pending', 'claimed', 'cooking', 'ready'] } });
        if (!order) return interaction.reply({ embeds: [createEmbed("❌ No Active Order", "You do not have an order in the queue.", ERROR_COLOR)], ephemeral: true });

        let eta = "";
        let progressBar = "";
        
        if (order.status === 'cooking') {
            eta = "~23 Minutes (Finishing Cook + Delivery)";
            progressBar = "🟧🟧⬜⬜ (Cooking)";
        } else if (order.status === 'ready') {
            eta = "10 - 20 Minutes (Awaiting Driver / Auto-Delivery)";
            progressBar = "🟧🟧🟧⬜ (Ready)";
        } else if (order.status === 'pending') {
            eta = await calculateETA();
            progressBar = "⬜⬜⬜⬜ (Pending)";
        } else if (order.status === 'claimed') {
            eta = await calculateETA();
            progressBar = "🟧⬜⬜⬜ (Prep)";
        }

        const embed = createEmbed("🧾 Order Status", `**Order ID:** \`${order.order_id}\``, BRAND_COLOR)
            .addFields(
                { name: "Item", value: order.item, inline: true },
                { name: "Status", value: `**${order.status.toUpperCase()}**`, inline: true },
                { name: "Progress", value: progressBar },
                { name: "Chef", value: order.chef_name || "Waiting for Chef...", inline: true },
                { name: "Estimated Delivery", value: eta, inline: true }
            );
        
        if ((order.status === 'cooking' || order.status === 'ready') && order.images.length > 0) {
            embed.setImage(order.images[0]);
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // --- CLAIM ---
    if (commandName === 'claim') {
        if (!perms.isStaff) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Staff only.", ERROR_COLOR)], ephemeral: true });
        const oid = interaction.options.getString('id');
        const order = await Order.findOne({ order_id: oid });
        if(!order || order.status !== 'pending') return interaction.reply({ embeds: [createEmbed("❌ Invalid Order", "Order not found or already claimed.", ERROR_COLOR)], ephemeral: true });
        
        order.status = 'claimed';
        order.chef_name = interaction.user.username;
        await order.save();
        updateMasterLog(oid);
        
        try { 
            const u = await client.users.fetch(order.user_id);
            u.send({ embeds: [createEmbed("👨‍🍳 Order Claimed", `Your order \`${oid}\` is being prepared by **${interaction.user.username}**!`, BRAND_COLOR)] });
        } catch(e){}
        
        await interaction.reply({ embeds: [createEmbed("👨‍🍳 Claimed", `You have claimed order \`${oid}\`. You have 4 minutes to cook!`, SUCCESS_COLOR)] });
    }

    // --- COOK ---
    if (commandName === 'cook') {
        if (!perms.isStaff) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Staff only.", ERROR_COLOR)], ephemeral: true });
        const oid = interaction.options.getString('id');
        const img1 = interaction.options.getAttachment('image');
        const img2 = interaction.options.getAttachment('image2');
        const img3 = interaction.options.getAttachment('image3');
        const link = interaction.options.getString('link');

        // VALIDATION: Must have at least 1 image (File or Link)
        if (!img1 && !img2 && !img3 && !link) {
            return interaction.reply({ embeds: [createEmbed("❌ Error", "You must provide at least one image or link.", ERROR_COLOR)], ephemeral: true });
        }

        // VALIDATION: If link provided, must look like an image
        if (link && !/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(link)) {
            return interaction.reply({ embeds: [createEmbed("❌ Error", "Link must end in .jpg, .png, .gif, or .webp.", ERROR_COLOR)], ephemeral: true });
        }
        
        const order = await Order.findOne({ order_id: oid });
        if(!order || order.status !== 'claimed') return interaction.reply({ embeds: [createEmbed("❌ Invalid Order", "Order not claimed or invalid status.", ERROR_COLOR)], ephemeral: true });
        
        order.status = 'cooking';
        order.images = [];
        if(img1) order.images.push(img1.url);
        if(img2) order.images.push(img2.url);
        if(img3) order.images.push(img3.url);
        if(link) order.images.push(link);

        await order.save();
        
        await User.findOneAndUpdate({ user_id: interaction.user.id }, { $inc: { cook_count_week: 1, cook_count_total: 1 } }, { upsert: true });
        updateMasterLog(oid);

        await interaction.reply({ embeds: [createEmbed("👨‍🍳 Cooking Started", `Order \`${oid}\` is cooking.\n\n⏱️ **Timer:** 3 Minutes`, BRAND_COLOR)] });

        setTimeout(async () => {
            const o = await Order.findOne({ order_id: oid });
            if(o && o.status === 'cooking') {
                o.status = 'ready';
                o.ready_at = new Date();
                await o.save();
                updateMasterLog(oid);

                const dc = client.channels.cache.get(CHANNELS.DELIVERY);
                if(dc) {
                    const embed = createEmbed("📦 Order Ready", `**ID:** \`${oid}\`\n**Chef:** ${interaction.user.username}\n\n*Waiting for Delivery Driver...*`, BRAND_COLOR);
                    dc.send({ embeds: [embed] });
                }

                try { 
                    const u = await client.users.fetch(o.user_id);
                    u.send({ embeds: [createEmbed("📦 Order Ready", `Your order \`${oid}\` is fresh out of the oven! A driver will pick it up soon.`, SUCCESS_COLOR)] });
                } catch(e){}
            }
        }, 180000); 
    }

    // --- SET SCRIPT ---
    if (commandName === 'setscript') {
        const msg = interaction.options.getString('message');
        await Script.findOneAndUpdate({ user_id: interaction.user.id }, { script: msg }, { upsert: true });
        await interaction.reply({ embeds: [createEmbed("✅ Script Saved", "Your custom delivery message has been updated.", SUCCESS_COLOR)], ephemeral: true });
    }

    // --- DELIVER ---
    if (commandName === 'deliver') {
        if (!perms.isStaff) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Staff only.", ERROR_COLOR)], ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });

        const oid = interaction.options.getString('id');
        const order = await Order.findOne({ order_id: oid });
        if(!order || order.status !== 'ready') return interaction.editReply({ embeds: [createEmbed("❌ Invalid Order", "Order not ready for delivery.", ERROR_COLOR)] });

        // UPDATED DEFAULT SCRIPT
        const defaultScript = `We are so happy to let you know that your Sugar Rush order is here! Thank you for choosing us to satisfy your cravings.\n\nWe strive for perfection, so we’d love to hear from you. You can rate your experience using \`/rate ${oid}\`.\n\nIf there were any issues with your delivery, please reach out directly using \`/complain ${oid}\` so we can fix it!`;
        
        const scriptDoc = await Script.findOne({ user_id: interaction.user.id });
        const script = scriptDoc ? scriptDoc.script : defaultScript;
        
        const guild = client.guilds.cache.get(order.guild_id);
        const channel = guild?.channels.cache.get(order.channel_id);
        
        let invite = null;
        if(channel) {
            try { invite = await channel.createInvite({ maxAge: 300, maxUses: 1 }); } catch(e) {}
        }

        if (invite) {
            try {
                const deliveryMsg = `**Chef:** ${order.chef_name}\n**Driver:** ${interaction.user.username}\n\n${script}`;
                const deliveryEmbed = createEmbed(`🚴 Delivery Instructions: #${oid}`, `**1. Join Server:** [Click Here](${invite.url})\n\n**2. Copy & Paste this Script:**\n\`\`\`\n${deliveryMsg}\n\`\`\`\n\n*(Don't forget to attach the images below!)*`, BRAND_COLOR);
                await interaction.user.send({ embeds: [deliveryEmbed], files: order.images });
                
                order.status = 'delivered'; 
                order.deliverer_id = interaction.user.id;
                await order.save();
                
                await User.findOneAndUpdate({ user_id: interaction.user.id }, { $inc: { deliver_count_week: 1, deliver_count_total: 1 } }, { upsert: true });
                updateMasterLog(oid);
                
                await interaction.editReply({ embeds: [createEmbed("✅ Delivery Started", "Check your DMs for the invite link and script!", SUCCESS_COLOR)] });
            } catch (err) {
                await interaction.editReply({ embeds: [createEmbed("❌ DM Failed", "Please open your DMs so I can send you the invite.", ERROR_COLOR)] });
            }
        } else {
            if(channel) {
                const embed = createEmbed("🚴 Order Delivered", `**Chef:** ${order.chef_name}\n**Driver:** ${interaction.user.username}\n\n**Message:**\n${script}`, BRAND_COLOR);
                if(order.images && order.images.length > 0) embed.setImage(order.images[0]);
                await channel.send({ content: `<@${order.user_id}>`, embeds: [embed] });
                if(order.images.length > 1) await channel.send({ files: order.images.slice(1) });

                order.status = 'delivered'; 
                order.deliverer_id = interaction.user.id;
                await order.save();
                await User.findOneAndUpdate({ user_id: interaction.user.id }, { $inc: { deliver_count_week: 1, deliver_count_total: 1 } }, { upsert: true });
                updateMasterLog(oid);
                await interaction.editReply({ embeds: [createEmbed("⚠️ Invite Failed", "I couldn't create an invite, so I delivered the order for you.", BRAND_COLOR)] });
            } else {
                await interaction.editReply({ embeds: [createEmbed("❌ Delivery Failed", "Could not reach the customer's channel.", ERROR_COLOR)] });
            }
        }
    }

    // --- SUPPORT ---
    if (commandName === 'support') {
        const embed = createEmbed("🆘 Need Help?", "Click the button below to join our Support Server for assistance, bug reports, or applications.", BRAND_COLOR);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Join Support Server").setStyle(ButtonStyle.Link).setURL(SUPPORT_SERVER_LINK));
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // --- SERVER BLACKLIST ---
    if (commandName === 'blacklist_server') {
        if (!perms.isOwner) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Owner only.", ERROR_COLOR)], ephemeral: true });
        const guildId = interaction.options.getString('server_id');
        const reason = interaction.options.getString('reason');
        await ServerBlacklist.findOneAndUpdate({ guild_id: guildId }, { reason: reason, banned_by: interaction.user.username }, { upsert: true });
        const log = createEmbed("🛑 Server Blacklisted", `**ID:** ${guildId}\n**Reason:** ${reason}\n**Admin:** ${interaction.user.username}`, ERROR_COLOR);
        await logToAdminChannel(log);
        await interaction.reply({ embeds: [createEmbed("🛑 Server Blacklisted", `**ID:** ${guildId}\n**Reason:** ${reason}`, ERROR_COLOR)] });
    }

    if (commandName === 'unblacklist_server') {
        if (!perms.isOwner) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Owner only.", ERROR_COLOR)], ephemeral: true });
        const guildId = interaction.options.getString('server_id');
        await ServerBlacklist.deleteOne({ guild_id: guildId });
        const log = createEmbed("✅ Server Unblacklisted", `**ID:** ${guildId}\n**Admin:** ${interaction.user.username}`, SUCCESS_COLOR);
        await logToAdminChannel(log);
        await interaction.reply({ embeds: [createEmbed("✅ Server Unblacklisted", `ID: ${guildId}`, SUCCESS_COLOR)] });
    }

    // --- VIP ADD/REMOVE ---
    if (commandName === 'addvip') {
        if (!perms.isOwner) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Owner only.", ERROR_COLOR)], ephemeral: true });
        const input = interaction.options.getString('user_input');
        const userId = input.replace(/\D/g, ''); 
        await PremiumUser.findOneAndUpdate({ user_id: userId }, { is_vip: true, expires_at: new Date(Date.now() + 30*24*60*60*1000) }, { upsert: true });
        try { (await client.guilds.cache.get(SUPPORT_SERVER_ID).members.fetch(userId)).roles.add(ROLES.VIP); } catch(e){}
        await interaction.reply({ embeds: [createEmbed("💎 VIP Gifted", `User ID: ${userId} has been given VIP status.`, SUCCESS_COLOR)] });
    }

    if (commandName === 'removevip') {
        if (!perms.isOwner) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Owner only.", ERROR_COLOR)], ephemeral: true });
        const input = interaction.options.getString('user_input');
        const userId = input.replace(/\D/g, '');
        await PremiumUser.findOneAndUpdate({ user_id: userId }, { is_vip: false, expires_at: null });
        try { (await client.guilds.cache.get(SUPPORT_SERVER_ID).members.fetch(userId)).roles.remove(ROLES.VIP); } catch(e){}
        await interaction.reply({ embeds: [createEmbed("📉 VIP Removed", `User ID: ${userId} lost VIP status.`, SUCCESS_COLOR)] });
    }

    // --- WARN (STAFF ONLY - BEFORE COOKING) ---
    if (commandName === 'warn') {
        if (!perms.isStaff) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Staff only.", ERROR_COLOR)], ephemeral: true });
        
        const oid = interaction.options.getString('id'); 
        const reason = interaction.options.getString('reason');
        const order = await Order.findOne({ order_id: oid }); 
        
        if(!order) return interaction.reply({ embeds: [createEmbed("❌ Error", "Invalid ID.", ERROR_COLOR)], ephemeral: true });
        
        // RESTRAINT: Only allowed if pending or claimed.
        if (['cooking', 'ready', 'delivered'].includes(order.status)) {
            return interaction.reply({ embeds: [createEmbed("❌ Warning Blocked", "Order is already cooking or ready. Ask a Manager to use `/fdo`.", ERROR_COLOR)], ephemeral: true });
        }

        order.status = 'cancelled_warn'; 
        await order.save(); 
        updateMasterLog(oid);

        const u = await User.findOne({ user_id: order.user_id }) || new User({ user_id: order.user_id });
        
        // Add Warning Record
        u.warning_history.push({ reason: reason, moderator: interaction.user.username });
        u.warnings += 1;

        let banDuration = null;
        if (u.warnings === 3) {
            banDuration = "7 Days";
            u.ban_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (u.warnings === 6) {
            banDuration = "30 Days";
            u.ban_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (u.warnings >= 9) {
            banDuration = "Permanent";
            u.is_banned = 1;
        }

        await u.save();
        
        const chan = client.channels.cache.get(CHANNELS.WARNING);
        if(chan) chan.send({ embeds: [createEmbed("⚠️ User Warned", `**User:** <@${order.user_id}>\n**Reason:** ${reason}\n**Strikes:** ${u.warnings}`, ERROR_COLOR)] });

        // LOGGING TO ADMIN CHANNEL
        if (banDuration) {
            const historyText = u.warning_history.map((w, i) => `${i+1}. ${w.reason} (Mod: ${w.moderator})`).join('\n').substring(0, 1000);
            const log = createEmbed("🚫 User Banned", `**User:** <@${order.user_id}> (${order.user_id})\n**Duration:** ${banDuration}\n**Total Strikes:** ${u.warnings}`, ERROR_COLOR)
                .addFields({ name: "Warning History", value: historyText || "No history found." });
            await logToAdminChannel(log);
        }

        await interaction.reply({ embeds: [createEmbed("✅ Action Taken", `User warned. Order removed. Total strikes: ${u.warnings}`, SUCCESS_COLOR)] });
    }

    // --- FDO (MANAGER ONLY - BEFORE DELIVERY) ---
    if (commandName === 'fdo') {
        if(!perms.isManager) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Managers only.", ERROR_COLOR)], ephemeral: true });
        
        const oid = interaction.options.getString('id'); 
        const reason = interaction.options.getString('reason');
        const order = await Order.findOne({ order_id: oid }); 
        
        if(!order) return interaction.reply({ embeds: [createEmbed("❌ Error", "Invalid ID.", ERROR_COLOR)], ephemeral: true });
        
        // RESTRAINT: Only allowed if NOT delivered.
        if (order.status === 'delivered') {
            return interaction.reply({ embeds: [createEmbed("❌ Error", "Cannot force delete a delivered order. Use `/force_warn` instead.", ERROR_COLOR)], ephemeral: true });
        }

        order.status = 'cancelled_fdo'; 
        await order.save(); 
        updateMasterLog(oid);

        const u = await User.findOne({ user_id: order.user_id }) || new User({ user_id: order.user_id });
        
        // Add Warning Record
        u.warning_history.push({ reason: reason, moderator: interaction.user.username });
        u.warnings += 1;

        let banDuration = null;
        if (u.warnings === 3) {
            banDuration = "7 Days";
            u.ban_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (u.warnings === 6) {
            banDuration = "30 Days";
            u.ban_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (u.warnings >= 9) {
            banDuration = "Permanent";
            u.is_banned = 1;
        }

        await u.save();
        
        const chan = client.channels.cache.get(CHANNELS.WARNING);
        if(chan) chan.send({ embeds: [createEmbed("⚠️ User Warned (FDO)", `**User:** <@${order.user_id}>\n**Reason:** ${reason}\n**Strikes:** ${u.warnings}`, ERROR_COLOR)] });

        // LOGGING TO ADMIN CHANNEL
        if (banDuration) {
            const historyText = u.warning_history.map((w, i) => `${i+1}. ${w.reason} (Mod: ${w.moderator})`).join('\n').substring(0, 1000);
            const log = createEmbed("🚫 User Banned", `**User:** <@${order.user_id}> (${order.user_id})\n**Duration:** ${banDuration}\n**Total Strikes:** ${u.warnings}`, ERROR_COLOR)
                .addFields({ name: "Warning History", value: historyText || "No history found." });
            await logToAdminChannel(log);
        }

        await interaction.reply({ embeds: [createEmbed("✅ Action Taken", `Order force deleted & User warned. Total strikes: ${u.warnings}`, SUCCESS_COLOR)] });
    }

    // --- FORCE WARN (MANAGER ONLY - POST DELIVERY) ---
    if (commandName === 'force_warn') {
        if(!perms.isManager) return interaction.reply({ embeds: [createEmbed("❌ Access Denied", "Managers only.", ERROR_COLOR)], ephemeral: true });
        
        const oid = interaction.options.getString('id'); 
        const reason = interaction.options.getString('reason');
        const order = await Order.findOne({ order_id: oid }); 
        
        if(!order) return interaction.reply({ embeds: [createEmbed("❌ Error", "Invalid ID.", ERROR_COLOR)], ephemeral: true });
        
        // This command DOES NOT change order status. It only warns the user.

        const u = await User.findOne({ user_id: order.user_id }) || new User({ user_id: order.user_id });
        
        // Add Warning Record
        u.warning_history.push({ reason: reason, moderator: interaction.user.username });
        u.warnings += 1;

        let banDuration = null;
        if (u.warnings === 3) {
            banDuration = "7 Days";
            u.ban_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (u.warnings === 6) {
            banDuration = "30 Days";
            u.ban_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (u.warnings >= 9) {
            banDuration = "Permanent";
            u.is_banned = 1;
        }

        await u.save();
        
        const chan = client.channels.cache.get(CHANNELS.WARNING);
        if(chan) chan.send({ embeds: [createEmbed("⚠️ User Warned (Post-Delivery)", `**User:** <@${order.user_id}>\n**Reason:** ${reason}\n**Strikes:** ${u.warnings}`, ERROR_COLOR)] });

        // LOGGING TO ADMIN CHANNEL
        if (banDuration) {
            const historyText = u.warning_history.map((w, i) => `${i+1}. ${w.reason} (Mod: ${w.moderator})`).join('\n').substring(0, 1000);
            const log = createEmbed("🚫 User Banned", `**User:** <@${order.user_id}> (${order.user_id})\n**Duration:** ${banDuration}\n**Total Strikes:** ${u.warnings}`, ERROR_COLOR)
                .addFields({ name: "Warning History", value: historyText || "No history found." });
            await logToAdminChannel(log);
        }

        await interaction.reply({ embeds: [createEmbed("✅ Action Taken", `User warned (Post-Delivery). Total strikes: ${u.warnings}`, SUCCESS_COLOR)] });
    }

    if (commandName === 'unban') {
        if(!perms.isManager) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Managers only.", ERROR_COLOR)], ephemeral: true });
        const target = interaction.options.getUser('user');
        
        await User.findOneAndUpdate({ user_id: target.id }, { is_banned: 0, warnings: 0, ban_expires_at: null });
        
        const log = createEmbed("✅ User Unbanned", `**User:** ${target.tag} (${target.id})\n**Admin:** ${interaction.user.username}`, SUCCESS_COLOR);
        await logToAdminChannel(log);

        await interaction.reply({ embeds: [createEmbed("✅ Unbanned", `${target.username} is no longer banned.`, SUCCESS_COLOR)] });
    }

    // --- OTHER COMMANDS ---
    if (commandName === 'runquota') {
        if(!perms.isManager) return interaction.reply({ embeds: [createEmbed("❌ Denied", "Managers only.", ERROR_COLOR)], ephemeral: true });
        await interaction.deferReply({ ephemeral: true }); await runQuotaLogic(interaction.guild); 
        await interaction.editReply({ embeds: [createEmbed("✅ Quota Run", "Weekly quota check forced successfully.", SUCCESS_COLOR)] });
    }

    if (commandName === 'rules') {
        const embed = createEmbed(`${BRAND_NAME} Rules`, "", BRAND_COLOR, [
            { name: "1. The Golden Rule", value: "**Every order MUST include a Desert.**" },
            { name: "2. Conduct", value: "No NSFW content in orders or images." },
            { name: "3. Queue", value: "One active order at a time per user." },
            { name: "4. Max Items", value: "Maximum 3 items per order." }
        ]);
        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'complain') {
        const oid = interaction.options.getString('id'); const reason = interaction.options.getString('reason');
        const order = await Order.findOne({ order_id: oid }); if(!order) return interaction.reply({ embeds: [createEmbed("❌ Error", "Invalid Order ID.", ERROR_COLOR)], ephemeral: true });
        const chan = client.channels.cache.get(CHANNELS.COMPLAINT); 
        if(chan) chan.send({ embeds: [createEmbed("🚨 New Complaint", `**Order:** \`${oid}\`\n**User:** <@${interaction.user.id}>\n**Reason:** ${reason}`, ERROR_COLOR)] });
        await interaction.reply({ embeds: [createEmbed("✅ Sent", "Your complaint has been sent to management.", SUCCESS_COLOR)], ephemeral: true });
    }

    if (commandName === 'orderlist') {
        const active = await Order.find({ status: { $in: ['pending', 'claimed', 'cooking', 'ready'] } }).sort({ is_vip: -1, created_at: 1 });
        let desc = ""; if (active.length === 0) desc = "Queue is currently empty.";
        active.forEach(o => { const vip = o.is_vip ? "💎 " : ""; desc += `${vip}\`${o.order_id}\`: **${o.status.toUpperCase()}** (${o.item})\n`; });
        await interaction.reply({ embeds: [createEmbed("🍩 Active Queue", desc.substring(0, 4000), BRAND_COLOR)], ephemeral: true });
    }

    if (commandName === 'unclaim') {
        const oid = interaction.options.getString('id');
        const order = await Order.findOne({ order_id: oid });
        if(!order || order.status !== 'claimed') return interaction.reply({ embeds: [createEmbed("❌ Error", "Order not claimed.", ERROR_COLOR)], ephemeral: true });
        if(order.chef_name !== interaction.user.username && !perms.isManager) return interaction.reply({ embeds: [createEmbed("❌ Error", "You did not claim this order.", ERROR_COLOR)], ephemeral: true });
        order.status = 'pending'; order.chef_name = null; await order.save(); updateMasterLog(oid); 
        await interaction.reply({ embeds: [createEmbed("🔓 Unclaimed", `Order \`${oid}\` has been released.`, SUCCESS_COLOR)] });
    }
});

client.login(BOT_TOKEN);
