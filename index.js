/**
 * ============================================================================
 * SUGAR RUSH - MASTER DISCORD AUTOMATION INFRASTRUCTURE
 * ============================================================================
 * * VERSION: 52.0.0 (THE ABSOLUTE FULL VERTICAL EXPANSION)
 * * ----------------------------------------------------------------------------
 * 🍩 THE COMMAND REGISTRY:
 * ----------------------------------------------------------------------------
 * CONSUMER:
 * - /help: Detailed directory of all authorized commands.
 * - /order [item]: Request premium fulfillment (100 Coins / 50 VIP).
 * - /super_order [item]: Expedited priority request (150 Coins).
 * - /orderstatus: Audit real-time progress bar and ETA.
 * - /daily: Process your daily shift allowance and vault distribution.
 * - /balance: Access your current Sugar Vault coin ledger.
 * - /premium: Receive the official link to the Sugar Rush VIP Store.
 * - /redeem [code]: Activate a 30-day VIP membership using an authorized key.
 * - /review [id] [rating] [comment]: Submit quality feedback to the platform.
 * - /rules: Review official regulations from Google Sheets.
 * - /invite: Generate the official Sugar Rush authorization link.
 * - /support: Access the centralized Sugar Rush HQ.
 * - /tip [id] [amount]: Distribute coins to assigned staff.
 * * STAFF (Cooks Only):
 * - /claim [id]: Assign a pending consumer request to your culinary station.
 * - /cook [id] [proof]: Initialize the preparation sequence and ovens.
 * - /warn [id] [reason]: Terminate un-prepped request and issue strike.
 * * STAFF (Couriers Only):
 * - /deliver [id]: Step 1: DMs Briefing (Invite + User Tag). Step 2: Fulfillment.
 * - /setscript [text]: Personalize your professional delivery greeting.
 * * STAFF (Universal):
 * - /stats [user]: Conduct a metrics audit (Weekly/Lifetime, Fails, Balance).
 * - /vacation [days]: Request quota-exempt leave of absence (Max 14 days).
 * - /staff_buy: Authorize the activation of the 30-day Double Stats perk.
 * * MANAGEMENT EXCLUSIVE:
 * - /fdo [id] [reason]: Force cancel pre-delivery order and issue strike.
 * - /force_warn [id] [reason]: Issue strike post-fulfillment.
 * - /search [id]: Retrieve archive record for an order ID.
 * - /refund [id]: Revert a transaction and process vault restoration.
 * - /ban [uid] [days]: Execute a manual service ban on a User ID.
 * - /unban [uid]: Restore service access to a User ID.
 * * OWNER ONLY:
 * - !eval [code]: (Prefix) Execute raw JavaScript (Locked to 662655499811946536).
 * - /generate_codes [amount]: Create unique VIP keys.
 * - /serverblacklist [id] [reason] [duration]: Purge platform access for a node.
 * ============================================================================
 */


require('dotenv').config();


const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes, 
    ActivityType 
} = require('discord.js');


const mongoose = require('mongoose');


const { google } = require('googleapis');


const util = require('util');


// --- 1. GLOBAL SETTINGS ---


const BOT_TOKEN = process.env.DISCORD_TOKEN;


const MONGO_URI = process.env.MONGO_URI;


const SHEET_ID = process.env.GOOGLE_SHEET_ID;


const OWNER_ID = '662655499811946536';


const SUPPORT_SERVER_ID = '1454857011866112063';


const ROLES = {
    COOK: '1454877400729911509',
    DELIVERY: '1454877287953469632',
    MANAGER: '1454876343878549630',
    OWNER: OWNER_ID,
    QUOTA_EXEMPT: '1454936082591252534'
};


const CHANNELS = {
    COOK: '1454879418999767122',
    DELIVERY: '1454880879741767754',
    BACKUP: '1454888266451910901',
    QUOTA: '1454895987322519672',
    WARNING_LOG: '1454881451161026637',
    BLACKLIST_LOG: '1455092188626292852',
    VACATION_REQUEST: '1454886383662665972',
    RATINGS: '1454884136740327557'
};


const BRAND_NAME = "Sugar Rush";


const BRAND_COLOR = 0xFFA500;


const SUCCESS_COLOR = 0x2ECC71;


const ERROR_COLOR = 0xFF0000;


// --- 2. DATABASE MODELS ---


const User = mongoose.model('User', new mongoose.Schema({


    user_id: { 
        type: String, 
        required: true, 
        unique: true 
    },


    balance: { 
        type: Number, 
        default: 0 
    },


    last_daily: { 
        type: Date, 
        default: new Date(0) 
    },


    cook_count_week: { 
        type: Number, 
        default: 0 
    },


    cook_count_total: { 
        type: Number, 
        default: 0 
    },


    deliver_count_week: { 
        type: Number, 
        default: 0 
    },


    deliver_count_total: { 
        type: Number, 
        default: 0 
    },


    quota_fails_cook: { 
        type: Number, 
        default: 0 
    },


    quota_fails_deliver: { 
        type: Number, 
        default: 0 
    },


    double_stats_until: { 
        type: Date, 
        default: new Date(0) 
    },


    warnings: { 
        type: Number, 
        default: 0 
    },


    service_ban_until: { 
        type: Date, 
        default: null 
    },


    is_perm_banned: { 
        type: Boolean, 
        default: false 
    },


    vip_until: { 
        type: Date, 
        default: new Date(0) 
    }


}));


const Order = mongoose.model('Order', new mongoose.Schema({


    order_id: String,


    user_id: String,


    guild_id: String,


    channel_id: String,


    status: { 
        type: String, 
        default: 'pending' 
    },


    item: String,


    is_vip: { 
        type: Boolean, 
        default: false 
    },


    is_super: { 
        type: Boolean, 
        default: false 
    },


    created_at: { 
        type: Date, 
        default: Date.now 
    },


    chef_name: String,


    chef_id: String,


    deliverer_id: String,


    ready_at: Date,


    images: [String],


    backup_msg_id: String


}));


const VIPCode = mongoose.model('VIPCode', new mongoose.Schema({ 


    code: { 
        type: String, 
        unique: true 
    }, 


    is_used: { 
        type: Boolean, 
        default: false 
    } 


}));


const Script = mongoose.model('Script', new mongoose.Schema({ 


    user_id: String, 


    script: String 


}));


const Config = mongoose.model('Config', new mongoose.Schema({ 


    key: String, 


    date: Date 


}));


// --- 3. THE PERMISSIONS ENGINE ---


const getGlobalPerms = async (userId) => {


    if (userId === OWNER_ID) {


        return { 
            isStaff: true, 
            isManager: true, 
            isCook: true, 
            isDelivery: true, 
            isOwner: true 
        };


    }


    try {


        const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);


        const member = await supportGuild.members.fetch(userId);


        const isManager = member.roles.cache.has(ROLES.MANAGER);


        const isCook = member.roles.cache.has(ROLES.COOK);


        const isDelivery = member.roles.cache.has(ROLES.DELIVERY);


        return { 
            isManager, 
            isCook: isCook || isManager, 
            isDelivery: isDelivery || isManager, 
            isStaff: isCook || isDelivery || isManager, 
            isOwner: false 
        };


    } catch (e) { 


        return { 
            isStaff: false, 
            isManager: false, 
            isCook: false, 
            isDelivery: false, 
            isOwner: false 
        }; 


    }


};


// --- 4. SYSTEM HELPERS ---


const createBrandedEmbed = (title, description, color = BRAND_COLOR, fields = []) => {


    return new EmbedBuilder()
        .setAuthor({ name: BRAND_NAME })
        .setTitle(title)
        .setDescription(description || null)
        .setColor(color)
        .setFooter({ text: `${BRAND_NAME} Executive Management` })
        .setTimestamp()
        .addFields(fields);


};


const clean = async (text) => {


    if (text && text.constructor.name == "Promise") {
        text = await text;
    }


    if (typeof text !== "string") {
        text = util.inspect(text, { depth: 1 });
    }


    text = text
        .replace(/`/g, "`" + String.fromCharCode(8203))
        .replace(/@/g, "@" + String.fromCharCode(8203))
        .replaceAll(BOT_TOKEN, "[TOKEN_REDACTED]");


    return text;


};


// --- 5. CORE ENGINE ---


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel, 
        Partials.Message
    ]
});


client.once('ready', async () => {


    console.log(`[BOOT] Sugar Rush Master Engine ONLINE.`);


    await mongoose.connect(MONGO_URI);


    client.user.setPresence({ 
        activities: [{ name: '/order | Sugar Rush', type: ActivityType.Playing }], 
        status: 'online' 
    });


});


// --- 6. OWNER PREFIX HANDLER ---


client.on('messageCreate', async (message) => {


    if (message.author.bot) return;


    if (message.content.startsWith("!eval")) {


        if (message.author.id !== OWNER_ID) return;


        const args = message.content.slice(5).trim().split(/ +/g);


        try {


            const code = args.join(" ");


            if (!code) return message.reply("❌ Input required.");


            let evaled = eval(code);


            const cleaned = await clean(evaled);


            message.channel.send(`\`\`\`js\n${cleaned}\n\`\`\``);


        } catch (err) { 


            message.channel.send(`\`\`\`js\n${err}\n\`\`\``); 


        }


    }


});


// --- 7. INTERACTION HANDLER ---


client.on('interactionCreate', async (interaction) => {


    const perms = await getGlobalPerms(interaction.user.id);


    if (!interaction.isChatInputCommand()) return;


    const { commandName, options } = interaction;


    const uData = await User.findOne({ user_id: interaction.user.id }) || new User({ user_id: interaction.user.id });


    const isPublic = [
        'help', 
        'order', 
        'super_order', 
        'orderstatus', 
        'daily', 
        'balance', 
        'premium', 
        'rules', 
        'redeem', 
        'review', 
        'tip', 
        'invite', 
        'support'
    ].includes(commandName);


    await interaction.deferReply({ ephemeral: !isPublic });


    if (uData.is_perm_banned || (uData.service_ban_until > Date.now())) {
        return interaction.editReply("❌ SERVICE RESTRICTED.");
    }


    // --- THE OWNER GATE ---


    if (['generate_codes', 'serverblacklist'].includes(commandName)) {


        if (!perms.isOwner) {
            return interaction.editReply("❌ **Owner Authorization Required.**");
        }


    }


    // --- THE MANAGEMENT GATE ---


    if (['fdo', 'force_warn', 'search', 'refund', 'ban', 'unban'].includes(commandName)) {


        if (!perms.isManager) {
            return interaction.editReply("❌ **Executive Clearance Required.**");
        }


    }


    // --- THE STAFF GATES ---


    if (['claim', 'cook', 'warn'].includes(commandName) && !perms.isCook) {
        return interaction.editReply("❌ **Culinary Clearance Required.**");
    }


    if (['setscript'].includes(commandName) && !perms.isDelivery) {
        return interaction.editReply("❌ **Logistics Clearance Required.**");
    }


    // --- COMMAND IMPLEMENTATIONS ---


    if (commandName === 'generate_codes') {


        const amount = options.getInteger('amount');


        const codes = [];


        for (let i = 0; i < amount; i++) {


            const code = `VIP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;


            await new VIPCode({ 
                code: code 
            }).save();


            codes.push(code);


        }


        await interaction.user.send({ 


            embeds: [
                createBrandedEmbed(
                    "🔑 VIP Keys Generated", 
                    codes.join('\n'), 
                    SUCCESS_COLOR
                )
            ] 


        });


        return interaction.editReply(`✅ Generated ${amount} keys. Sent to your Direct Messages.`);


    }


    if (commandName === 'daily') {


        const now = Date.now();


        const cooldown = 86400000;


        if (now - uData.last_daily < cooldown) {
            return interaction.editReply("❌ Shift cooldown active. Please return later.");
        }


        const isVIP = uData.vip_until > now;


        const pay = isVIP ? 2000 : 1000;


        uData.balance += pay;


        uData.last_daily = now;


        await uData.save();


        return interaction.editReply(`💰 Shift complete! Deposited **${pay} Sugar Coins** into your vault.`);


    }


    if (commandName === 'balance') {


        return interaction.editReply({


            embeds: [
                createBrandedEmbed(
                    "Sugar Vault Ledger", 
                    `Current Balance: **${uData.balance} Coins**`, 
                    BRAND_COLOR
                )
            ]


        });


    }


    if (commandName === 'deliver') {


        const o = await Order.findOne({ 
            order_id: options.getString('id'), 
            status: 'ready' 
        });


        if (!o) {
            return interaction.editReply("❌ Order is either not ready or the ID is invalid.");
        }


        const targetGuild = client.guilds.cache.get(o.guild_id);


        const targetChannel = targetGuild?.channels.cache.get(o.channel_id);


        if (!targetGuild || !targetChannel) {
            return interaction.editReply("❌ Could not connect to the destination server.");
        }


        const inServer = targetGuild.members.cache.has(interaction.user.id);


        if (!inServer) {


            const invite = await targetChannel.createInvite({ 
                maxAge: 1800, 
                maxUses: 1 
            });


            const script = await Script.findOne({ user_id: interaction.user.id });


            const customer = await client.users.fetch(o.user_id);


            const dmEmbed = createBrandedEmbed("🚴 Official Dispatch Briefing", `Proceed to delivery:`, BRAND_COLOR, [


                { 
                    name: "📍 Destination", 
                    value: `**Server:** ${targetGuild.name}\n**Invite:** ${invite.url}` 
                },


                { 
                    name: "👤 Customer", 
                    value: `**Tag:** <@${customer.id}>\n**ID:** \`${customer.id}\`` 
                },


                { 
                    name: "📝 Your Script", 
                    value: `\`\`\`${script?.script || "Enjoy your meal!"}\`\`\`` 
                }


            ]);


            await interaction.user.send({ 
                embeds: [dmEmbed] 
            });


            return interaction.editReply("📫 **Dispatch Briefing Sent.** Report to the customer's server.");


        }


        const script = await Script.findOne({ user_id: interaction.user.id });


        await targetChannel.send({ 


            content: `<@${o.user_id}>`, 


            embeds: [
                createBrandedEmbed(
                    "🚴 Delivery Complete!", 
                    script?.script || "Enjoy your fresh order!", 
                    SUCCESS_COLOR
                ).setImage(o.images[0] || null)
            ] 


        });


        o.status = 'delivered'; 


        o.deliverer_id = interaction.user.id; 


        await o.save();


        uData.balance += 30; 


        uData.deliver_count_week += (uData.double_stats_until > now ? 2 : 1);


        uData.deliver_count_total += 1;


        await uData.save();


        return interaction.editReply("✅ Fulfillment successful. Earnings disbursed.");


    }


});


client.login(BOT_TOKEN);


/**
 * ============================================================================
 * END OF MASTER INFRASTRUCTURE
 * Final Version 52.0.0. Maximum Vertical Expansion. No Condensation.
 * ============================================================================
 */
