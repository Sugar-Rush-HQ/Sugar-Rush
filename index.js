require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionsBitField, 
    REST, 
    Routes, 
    ActivityType 
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

    status: { 
        type: String, 
        default: 'pending' 
    },

    item: String,

    is_vip: Boolean,

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

    claimed_at: Date,

    ready_at: Date,

    images: [String],

    rating: Number,

    backup_msg_id: String

});

const userSchema = new mongoose.Schema({

    user_id: String,

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

    warnings: { 
        type: Number, 
        default: 0 
    },

    warning_history: [{ 
        reason: String, 
        moderator: String, 
        date: { 
            type: Date, 
            default: Date.now 
        } 
    }],

    is_banned: { 
        type: Number, 
        default: 0 
    },

    ban_expires_at: Date,

    balance: { 
        type: Number, 
        default: 0 
    },

    last_daily: { 
        type: Date, 
        default: new Date(0) 
    },

    double_stats_until: { 
        type: Date, 
        default: new Date(0) 
    }

});

const premiumSchema = new mongoose.Schema({

    user_id: String,

    is_vip: Boolean,

    expires_at: Date

});

const codeSchema = new mongoose.Schema({

    code: String,

    status: { 
        type: String, 
        default: 'unused' 
    },

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

    date: { 
        type: Date, 
        default: Date.now 
    }

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

    partials: [
        Partials.Channel
    ],

    presence: {
        status: 'online',
        activities: [{ 
            name: '/order | Sugar Rush', 
            type: ActivityType.Playing 
        }]
    }

});

// --- 4. HELPER FUNCTIONS ---

const getGlobalPerms = async (userId) => {

    if (userId === ROLES.OWNER) {
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

        if (!supportGuild) {
            return { 
                isStaff: false, 
                isManager: false, 
                isOwner: false 
            }; 
        }

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

        return { 
            isStaff: false, 
            isManager: false, 
            isOwner: false 
        };

    }

};

const createEmbed = (title, description, color = BRAND_COLOR, fields = []) => {

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || null)
        .setColor(color)
        .setFooter({ 
            text: BRAND_NAME, 
            iconURL: client.user?.displayAvatarURL() 
        })
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;

};

const logToAdminChannel = async (embed) => {

    try {

        const channel = await client.channels.fetch(CHANNELS.LOGS).catch(() => null);

        if (channel) {
            await channel.send({ 
                embeds: [embed] 
            });
        }

    } catch (e) {

        console.error("Failed to log to admin channel", e);

    }

};

const updateMasterLog = async (orderId) => {

    try {

        const channel = await client.channels.fetch(CHANNELS.BACKUP).catch(() => null);

        if (!channel) {
            return;
        }

        const o = await Order.findOne({ 
            order_id: orderId 
        });

        if (!o) {
            return;
        }

        const guild = client.guilds.cache.get(o.guild_id);

        const serverName = guild ? guild.name : "Unknown Server";

        const embed = new EmbedBuilder()
            .setTitle(`🍩 Order #${o.order_id}`)
            .setColor(BRAND_COLOR)
            .addFields(
                { 
                    name: 'Status', 
                    value: `**${o.status.toUpperCase()}**`, 
                    inline: true 
                },
                { 
                    name: 'Item', 
                    value: o.item, 
                    inline: true 
                },
                { 
                    name: 'Client', 
                    value: `<@${o.user_id}>\n(ID: ${o.user_id})`, 
                    inline: true 
                },
                { 
                    name: 'Origin Server', 
                    value: `${serverName}\n(ID: ${o.guild_id})`, 
                    inline: true 
                },
                { 
                    name: 'Chef', 
                    value: o.chef_name || 'None', 
                    inline: true 
                },
                { 
                    name: 'Deliverer', 
                    value: o.deliverer_id ? `<@${o.deliverer_id}>` : 'None', 
                    inline: true 
                }
            )
            .setTimestamp();

        if (o.images && o.images.length > 0) {

            embed.setImage(o.images[0]);

            const linkList = o.images.map((url, index) => `[Image ${index + 1}](${url})`).join(' | ');

            embed.addFields({ 
                name: 'Proof/Attachments', 
                value: linkList 
            });

        }

        if (!o.backup_msg_id) {

            const msg = await channel.send({ 
                embeds: [embed] 
            });

            o.backup_msg_id = msg.id;

            await o.save();

        } else {

            const msg = await channel.messages.fetch(o.backup_msg_id).catch(() => null);

            if (msg) {
                await msg.edit({ 
                    embeds: [embed] 
                });
            }

        }

    } catch (e) { 

        console.error(e); 

    }

};

const generateCode = () => {
    return `VIP-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
};

const calculateETA = async () => {

    const queueSize = await Order.countDocuments({ 
        status: { 
            $in: ['pending', 'claimed', 'cooking', 'ready'] 
        } 
    });

    let totalStaff = 0;

    try {

        const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);

        if (supportGuild) {

            await supportGuild.members.fetch(); 

            const cooks = supportGuild.roles.cache.get(ROLES.COOK)?.members.size || 0;

            const drivers = supportGuild.roles.cache.get(ROLES.DELIVERY)?.members.size || 0;

            totalStaff = cooks + drivers;

        }

    } catch (e) { 

        totalStaff = 5; 

    }

    if (totalStaff === 0) {
        return "Indefinite (No Staff Online)";
    }

    if (totalStaff <= 10) {
        return "**2 - 6 Hours** (High Volume / Low Staff)";
    }

    const minutes = Math.ceil(((queueSize + 1) * 40) / totalStaff);

    if (minutes < 15) {
        return "15 - 30 Minutes"; 
    }

    if (minutes > 120) {
        return `${Math.ceil(minutes/60)} Hours`;
    }

    return `${minutes} Minutes`;

};

// --- 5. EVENTS ---

client.once('clientReady', async () => {

    console.log(`🚀 ${BRAND_NAME} is ONLINE as ${client.user.tag}`);

    client.user.setPresence({ 
        activities: [{ 
            name: '/order | Sugar Rush', 
            type: ActivityType.Playing 
        }], 
        status: 'online' 
    });

    try {

        await mongoose.connect(MONGO_URI);

        console.log("✅ Connected to MongoDB");

    } catch (e) { 

        console.error("❌ MongoDB Error:", e); 

    }

    const commands = [
        { 
            name: 'order', 
            description: 'Order food (100 Coins / 50 VIP)', 
            options: [{ 
                name: 'item', 
                type: 3, 
                required: true, 
                description: 'Item' 
            }] 
        },
        { 
            name: 'super_order', 
            description: 'Priority order + Staff Ping (150 Coins)', 
            options: [{ 
                name: 'item', 
                type: 3, 
                required: true, 
                description: 'Item' 
            }] 
        },
        { 
            name: 'orderstatus', 
            description: 'Check the status and ETA of your active order' 
        },
        { 
            name: 'daily', 
            description: 'Claim daily coins (1000 / 2000 VIP)' 
        },
        { 
            name: 'balance', 
            description: 'Check your balance' 
        },
        { 
            name: 'tip', 
            description: 'Tip staff', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'amount', 
                    type: 4, 
                    required: true, 
                    description: 'Amount' 
                }
            ] 
        },
        { 
            name: 'refund', 
            description: 'Manager: Refund an order', 
            options: [{ 
                name: 'id', 
                type: 3, 
                required: true, 
                description: 'Order ID' 
            }] 
        },
        { 
            name: 'staff_buy', 
            description: 'Staff: Buy Perks', 
            options: [{ 
                name: 'item', 
                type: 3, 
                required: true, 
                description: 'Perk', 
                choices: [{ 
                    name: 'Double Stats (1 Month) - 15,000 Coins', 
                    value: 'double_stats' 
                }] 
            }] 
        },
        { 
            name: 'claim', 
            description: 'Claim order', 
            options: [{ 
                name: 'id', 
                type: 3, 
                required: true, 
                description: 'ID' 
            }] 
        },
        { 
            name: 'cook', 
            description: 'Cook order', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'link', 
                    type: 3, 
                    required: false, 
                    description: 'Image Link (Priority)' 
                },
                { 
                    name: 'image', 
                    type: 11, 
                    required: false, 
                    description: 'Or Upload Proof 1' 
                },
                { 
                    name: 'image2', 
                    type: 11, 
                    required: false, 
                    description: 'Or Upload Proof 2' 
                },
                { 
                    name: 'image3', 
                    type: 11, 
                    required: false, 
                    description: 'Or Upload Proof 3' 
                }
            ] 
        },
        { 
            name: 'deliver', 
            description: 'Deliver order', 
            options: [{ 
                name: 'id', 
                type: 3, 
                required: true, 
                description: 'ID' 
            }] 
        },
        { 
            name: 'setscript', 
            description: 'Set delivery message', 
            options: [{ 
                name: 'message', 
                type: 3, 
                required: true, 
                description: 'Script' 
            }] 
        },
        { 
            name: 'invite', 
            description: 'Get invite link' 
        },
        { 
            name: 'support', 
            description: 'Get link to support server' 
        },
        { 
            name: 'help', 
            description: 'Show available commands' 
        },
        { 
            name: 'warn', 
            description: 'Warn user', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'fdo', 
            description: 'Force delete order', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'force_warn', 
            description: 'Manager: Warn user (Post-Delivery)', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'Order ID' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'unban', 
            description: 'Unban user', 
            options: [{ 
                name: 'user', 
                type: 6, 
                required: true, 
                description: 'User' 
            }] 
        },
        { 
            name: 'rules', 
            description: 'View rules' 
        },
        { 
            name: 'generate_codes', 
            description: 'Owner: Gen Codes', 
            options: [{ 
                name: 'amount', 
                type: 4, 
                required: true, 
                description: 'Amount' 
            }] 
        },
        { 
            name: 'redeem', 
            description: 'Redeem VIP', 
            options: [{ 
                name: 'code', 
                type: 3, 
                required: true, 
                description: 'Code' 
            }] 
        },
        { 
            name: 'addvip', 
            description: 'Owner: Give VIP', 
            options: [{ 
                name: 'user_input', 
                type: 3, 
                required: true, 
                description: 'User ID or Ping' 
            }] 
        },
        { 
            name: 'removevip', 
            description: 'Owner: Revoke VIP', 
            options: [{ 
                name: 'user_input', 
                type: 3, 
                required: true, 
                description: 'User ID or Ping' 
            }] 
        },
        { 
            name: 'vacation', 
            description: 'Request vacation', 
            options: [
                { 
                    name: 'days', 
                    type: 4, 
                    required: true, 
                    description: 'Days' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'quota', 
            description: 'Check your current quota status' 
        },
        { 
            name: 'stats', 
            description: 'Check staff stats (Rating, Totals)', 
            options: [{ 
                name: 'user', 
                type: 6, 
                required: false, 
                description: 'User' 
            }] 
        },
        { 
            name: 'rate', 
            description: 'Rate service', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'stars', 
                    type: 4, 
                    required: true, 
                    description: '1-5' 
                }
            ] 
        },
        { 
            name: 'complain', 
            description: 'Complaint', 
            options: [
                { 
                    name: 'id', 
                    type: 3, 
                    required: true, 
                    description: 'ID' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'orderlist', 
            description: 'View queue' 
        },
        { 
            name: 'unclaim', 
            description: 'Drop order', 
            options: [{ 
                name: 'id', 
                type: 3, 
                required: true, 
                description: 'ID' 
            }] 
        },
        { 
            name: 'runquota', 
            description: 'Manager: Force Run Quota' 
        },
        { 
            name: 'blacklist_server', 
            description: 'Block a server from ordering', 
            options: [
                { 
                    name: 'server_id', 
                    type: 3, 
                    required: true, 
                    description: 'Guild ID' 
                }, 
                { 
                    name: 'reason', 
                    type: 3, 
                    required: true, 
                    description: 'Reason' 
                }
            ] 
        },
        { 
            name: 'unblacklist_server', 
            description: 'Unblock a server', 
            options: [{ 
                name: 'server_id', 
                type: 3, 
                required: true, 
                description: 'Guild ID' 
            }] 
        }
    ];

    const syncCommands = async () => {

        try {

            console.log("⏳ Refreshing application (/) commands...");

            const rest = new REST({ 
                version: '10' 
            }).setToken(BOT_TOKEN);

            await rest.put(
                Routes.applicationCommands(client.user.id), 
                { body: commands }
            );

            console.log("✅ Successfully reloaded application (/) commands.");

        } catch (error) {

            console.error("❌ Command Sync Error:", error);

        }

    };

    await syncCommands();

    setInterval(syncCommands, 43200000); // 12 Hours
    
    setInterval(() => {

        client.user.setPresence({ 
            activities: [{ 
                name: '/order | Sugar Rush', 
                type: ActivityType.Playing 
            }], 
            status: 'online' 
        });

    }, 300000); 

    setInterval(checkTasks, 60000);

});

// --- 6. AUTOMATED SYSTEMS ---

async function checkTasks() {

    const now = new Date();

    // 1. Auto Delivery
    const threshold = new Date(now - 20 * 60000);

    const overdue = await Order.find({ 
        status: 'ready', 
        ready_at: { $lt: threshold } 
    });
    
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

                    if (o.images && o.images.length > 0) {
                        embed.setImage(o.images[0]);
                    }
                    
                    await channel.send({ 
                        content: `<@${o.user_id}>`, 
                        embeds: [embed] 
                    });

                    if (o.images.length > 1) {
                        await channel.send({ 
                            files: o.images.slice(1) 
                        });
                    }
                    
                    o.status = 'delivered';

                    o.deliverer_id = 'AUTO_BOT';

                    await o.save();

                    updateMasterLog(o.order_id);

                }
            }
        } catch (e) { 

            console.error("Auto-Deliver Failed:", e); 

        }

    }

    // 2. VIP Expiry Monitor
    const expiredVips = await PremiumUser.find({ 
        is_vip: true, 
        expires_at: { $lt: now } 
    });

    for (const v of expiredVips) {

        v.is_vip = false; 

        v.expires_at = null; 

        await v.save();

        try {

            const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);

            if (supportGuild) {

                const member = await supportGuild.members.fetch(v.user_id).catch(() => null);

                if (member) {
                    await member.roles.remove(ROLES.VIP).catch(() => {});
                }

            }

        } catch (e) {}

    }

    // 3. Weekly Quota Logic
    if (now.getUTCDay() === 0 && now.getUTCHours() === 23) {

        const lastRun = await Config.findOne({ 
            key: 'last_quota_run' 
        });

        const twelveHours = 12 * 60 * 60 * 1000;

        if (!lastRun || (now - lastRun.date) > twelveHours) {

            for (const [id, guild] of client.guilds.cache) {

                await runQuotaLogic(guild);

            }

            await Config.findOneAndUpdate(
                { key: 'last_quota_run' }, 
                { date: now }, 
                { upsert: true }
            );

        }

    }

}

const calculateTargets = (volume, staffCount) => {

    if (staffCount === 0) {
        return { norm: 0, senior: 0 };
    }

    let raw = Math.ceil(volume / staffCount);

    let norm = Math.min(raw, 30);

    let senior = Math.ceil(norm / 2);

    if (volume > 0) { 
        norm = Math.max(1, norm); 
        senior = Math.max(1, senior); 
    }

    return { norm, senior };

};

async function runQuotaLogic(guild) {

    if (guild.id !== SUPPORT_SERVER_ID) {
        return;
    }

    const quotaChannel = guild.channels.cache.get(CHANNELS.QUOTA);

    if (!quotaChannel) {
        return;
    }

    const cookRole = guild.roles.cache.get(ROLES.COOK);

    const delRole = guild.roles.cache.get(ROLES.DELIVERY);

    if (!cookRole || !delRole) {
        return;
    }

    await guild.members.fetch(); 

    const cooks = cookRole.members.map(m => m);

    const deliverers = delRole.members.map(m => m);

    // --- BONUS PAYOUTS ---
    const allActiveStaff = await User.find({ 
        $or: [
            { cook_count_week: { $gt: 0 } }, 
            { deliver_count_week: { $gt: 0 } }
        ] 
    });

    if (allActiveStaff.length > 0) {

        const topCook = [...allActiveStaff].sort((a, b) => b.cook_count_week - a.cook_count_week)[0];

        const topDriver = [...allActiveStaff].sort((a, b) => b.deliver_count_week - a.deliver_count_week)[0];

        if (topCook && topCook.cook_count_week > 0) {

            topCook.balance += 3000; 

            await topCook.save();

            quotaChannel.send(`🏆 **Top Cook Bonus:** <@${topCook.user_id}> earned **3,000 Coins**!`);

        }

        if (topDriver && topDriver.deliver_count_week > 0) {

            topDriver.balance += 3000; 

            await topDriver.save();

            quotaChannel.send(`🏆 **Top Driver Bonus:** <@${topDriver.user_id}> earned **3,000 Coins**!`);

        }

    }

    const allUsers = await User.find({});

    let totalCook = 0; 

    let totalDel = 0;
    
    for (const m of cooks) { 
        const u = allUsers.find(u => u.user_id === m.id); 
        if(u) {
            totalCook += u.cook_count_week; 
        }
    }

    for (const m of deliverers) { 
        const u = allUsers.find(u => u.user_id === m.id); 
        if(u) {
            totalDel += u.deliver_count_week; 
        }
    }

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

            u.quota_fails_cook = 0; 

            report += `✅ <@${m.id}>: ${done}/${target}\n`;

        } else {

            u.quota_fails_cook += 1;

            if (u.quota_fails_cook >= 2) { 

                m.roles.remove(ROLES.COOK).catch(()=>{}); 

                u.quota_fails_cook = 0; 

                report += `❌ <@${m.id}>: ${done}/${target} (**REMOVED**)\n`; 

            } else { 

                report += `⚠️ <@${m.id}>: ${done}/${target} (Strike ${u.quota_fails_cook}/2)\n`; 

            }

        }

        u.cook_count_week = 0; 

        await u.save();

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

            u.quota_fails_deliver = 0; 

            report += `✅ <@${m.id}>: ${done}/${target}\n`;

        } else {

            u.quota_fails_deliver += 1;

            if (u.quota_fails_deliver >= 2) { 

                m.roles.remove(ROLES.DELIVERY).catch(()=>{}); 

                u.quota_fails_deliver = 0; 

                report += `❌ <@${m.id}>: ${done}/${target} (**REMOVED**)\n`; 

            } else { 

                report += `⚠️ <@${m.id}>: ${done}/${target} (Strike ${u.quota_fails_deliver}/2)\n`; 

            }

        }

        u.deliver_count_week = 0; 

        await u.save();

    }

    const embed = createEmbed("📊 Weekly Quota Report", report.substring(0, 4000), BRAND_COLOR);

    await quotaChannel.send({ embeds: [embed] });

}

// --- 7. INTERACTIONS ---

client.on('interactionCreate', async interaction => {

    const perms = await getGlobalPerms(interaction.user.id);

    const uData = await User.findOne({ user_id: interaction.user.id }) || new User({ user_id: interaction.user.id });

    const isVIP = !!(await PremiumUser.findOne({ user_id: interaction.user.id, is_vip: true }));

    // --- 7A. CHANNEL & SERVER RESTRICTIONS ---

    if (interaction.isChatInputCommand()) {

        const { commandName } = interaction;

        // --- HELP COMMAND ---
        if (commandName === 'help') {

            const isSupport = interaction.guildId === SUPPORT_SERVER_ID;

            const isKitchen = interaction.channelId === CHANNELS.COOK;

            const isDelivery = interaction.channelId === CHANNELS.DELIVERY;

            const visibleCommands = [];

            visibleCommands.push('**/order** - Order food');

            visibleCommands.push('**/super_order** - Priority Order');

            visibleCommands.push('**/daily** - Claim Sugar Coins');

            visibleCommands.push('**/balance** - Check Coins');

            visibleCommands.push('**/tip** - Tip staff');

            visibleCommands.push('**/orderstatus** - Check your order');

            visibleCommands.push('**/rules** - View rules');

            visibleCommands.push('**/invite** - Invite bot');

            visibleCommands.push('**/support** - Get help');

            visibleCommands.push('**/rate** - Rate service');

            visibleCommands.push('**/complain** - File complaint');

            visibleCommands.push('**/redeem** - Redeem VIP code');

            if ((perms.isStaff && (isKitchen || isSupport)) || perms.isManager || perms.isOwner) {

                const note = (isKitchen || perms.isManager || perms.isOwner) ? "" : " *(Kitchen Only)*";

                visibleCommands.push(`**/claim** - Claim an order${note}`);

                visibleCommands.push(`**/cook** - Start cooking${note}`);

                visibleCommands.push(`**/staff_buy** - Perk Shop`);

            }

            if ((perms.isStaff && (isDelivery || isSupport)) || perms.isManager || perms.isOwner) {

                const note = (isDelivery || perms.isManager || perms.isOwner) ? "" : " *(Delivery Only)*";

                visibleCommands.push(`**/deliver** - Deliver order${note}`);

                visibleCommands.push(`**/orderlist** - View queue`);

            }

            if (perms.isManager || perms.isOwner) {

                visibleCommands.push('\n__**Manager Commands**__');

                visibleCommands.push('**/refund** - Refund coins');

                visibleCommands.push('**/warn** - Warn user');

                visibleCommands.push('**/fdo** - Force delete order');

                visibleCommands.push('**/unban** - Unban user');

                visibleCommands.push('**/unclaim** - Force unclaim order');

                visibleCommands.push('**/runquota** - Force quota check');

            }

            if (perms.isOwner) {

                visibleCommands.push('\n__**Owner Commands**__');

                visibleCommands.push('**/addvip** - Give VIP');

                visibleCommands.push('**/removevip** - Remove VIP');

                visibleCommands.push('**/generate_codes** - Create VIP codes');

                visibleCommands.push('**/blacklist_server** - Ban server');

                visibleCommands.push('**/unblacklist_server** - Unban server');

            }

            const embed = createEmbed("🍩 Assistant", visibleCommands.join('\n'), BRAND_COLOR);

            return interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });

        }

        // --- DAILY ---
        if (commandName === 'daily') {

            if (Date.now() - uData.last_daily < 86400000) {
                return interaction.reply({ 
                    content: "❌ Not ready yet!", 
                    ephemeral: true 
                });
            }

            const reward = isVIP ? 2000 : 1000;

            uData.balance += reward; 

            uData.last_daily = Date.now(); 

            await uData.save();

            return interaction.reply({ 
                embeds: [createEmbed("💰 Daily Reward", `You received **${reward} Sugar Coins**!`, SUCCESS_COLOR)] 
            });

        }

        // --- BALANCE ---
        if (commandName === 'balance') {

            return interaction.reply({ 
                content: `🏦 Ledger balance: **${uData.balance} Sugar Coins**.`, 
                ephemeral: true 
            });

        }

        // --- STAFF BUY ---
        if (commandName === 'staff_buy') {

            if (!perms.isStaff) {
                return interaction.reply({ 
                    content: "❌ Staff only.", 
                    ephemeral: true 
                });
            }

            if (uData.balance < 15000) {
                return interaction.reply({ 
                    content: "❌ Cost: 15,000 Coins.", 
                    ephemeral: true 
                });
            }

            uData.balance -= 15000;

            const currentExp = uData.double_stats_until > Date.now() ? uData.double_stats_until.getTime() : Date.now();

            uData.double_stats_until = new Date(currentExp + (30 * 24 * 60 * 60 * 1000));

            await uData.save();

            return interaction.reply({ 
                embeds: [createEmbed("⚡ Perk Active", "Double Stats enabled for 1 month!", SUCCESS_COLOR)] 
            });

        }

        // --- TIP ---
        if (commandName === 'tip') {

            const amount = interaction.options.getInteger('amount');

            if (uData.balance < amount) {
                return interaction.reply({ 
                    content: "❌ Poor!", 
                    ephemeral: true 
                });
            }

            const order = await Order.findOne({ 
                order_id: interaction.options.getString('id'), 
                status: 'delivered' 
            });

            if (!order) {
                return interaction.reply({ 
                    content: "❌ Order not delivered.", 
                    ephemeral: true 
                });
            }

            uData.balance -= amount; 

            await uData.save();

            if (order.deliverer_id && order.deliverer_id !== 'AUTO_BOT') {

                const split = Math.floor(amount / 2);

                await User.findOneAndUpdate({ user_id: order.chef_id }, { $inc: { balance: split } }, { upsert: true });

                await User.findOneAndUpdate({ user_id: order.deliverer_id }, { $inc: { balance: amount - split } }, { upsert: true });

            } else {

                await User.findOneAndUpdate({ user_id: order.chef_id }, { $inc: { balance: amount } }, { upsert: true });

            }

            return interaction.reply({ 
                content: "💖 Tip sent!" 
            });

        }

        // --- REFUND ---
        if (commandName === 'refund') {

            if (!perms.isManager) {
                return interaction.reply("Denied.");
            }

            const order = await Order.findOne({ 
                order_id: interaction.options.getString('id') 
            });

            if (!order || order.status === 'refunded') {
                return interaction.reply("Invalid.");
            }

            const cost = order.is_super ? 150 : (order.is_vip ? 50 : 100);

            await User.findOneAndUpdate({ user_id: order.user_id }, { $inc: { balance: cost } });

            order.status = 'refunded'; 

            await order.save(); 

            updateMasterLog(order.order_id);

            return interaction.reply("💰 Coins refunded.");

        }

        // --- SUPER ORDER ---
        if (commandName === 'super_order') {

            if (isVIP) {
                return interaction.reply({ 
                    content: "❌ VIP already has priority.", 
                    ephemeral: true 
                });
            }

            if (uData.balance < 150) {
                return interaction.reply({ 
                    content: "❌ Cost: 150 Coins.", 
                    ephemeral: true 
                });
            }

            const item = interaction.options.getString('item');

            const oid = Math.random().toString(36).substring(2, 8).toUpperCase();

            uData.balance -= 150; 

            await uData.save();

            await new Order({ 
                order_id: oid, 
                user_id: interaction.user.id, 
                guild_id: interaction.guild.id, 
                channel_id: interaction.channel.id, 
                item: item, 
                is_super: true 
            }).save();

            client.channels.cache.get(CHANNELS.COOK)?.send({ 
                content: "@here 🚀 **SUPER ORDER**", 
                embeds: [createEmbed("🚀 Super Order!", `**Item:** ${item}\n**ID:** \`${oid}\``, 0xE74C3C)] 
            });

            updateMasterLog(oid);

            return interaction.reply({ 
                content: `✅ Super Order placed! ID: \`${oid}\``, 
                ephemeral: true 
            });

        }

        // --- VACATION COMMAND ---
        if (commandName === 'vacation') {

            const days = interaction.options.getInteger('days');

            const reason = interaction.options.getString('reason');

            if (days < 1 || days > 14) {
                return interaction.reply({ 
                    content: "❌ Days must be between 1 and 14.", 
                    ephemeral: true 
                });
            }

            const embed = createEmbed("🏖️ Vacation Request", `**User:** <@${interaction.user.id}>\n**Duration:** ${days} Days\n**Reason:** ${reason}`, BRAND_COLOR);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`vacApprove_${interaction.user.id}_${days}`).setLabel("Approve").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`vacEdit_${interaction.user.id}_${days}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`vacDeny_${interaction.user.id}_${days}`).setLabel("Deny").setStyle(ButtonStyle.Danger)
            );

            const chan = client.channels.cache.get(CHANNELS.VACATION);

            if (chan) {
                await chan.send({ 
                    embeds: [embed], 
                    components: [row] 
                });
            }

            return interaction.reply({ 
                content: "✅ Request submitted.", 
                ephemeral: true 
            });

        }

        // --- STATS COMMAND ---
        if (commandName === 'stats') {

            const target = interaction.options.getUser('user') || interaction.user;

            const d = await User.findOne({ 
                user_id: target.id 
            });

            if (!d) {
                return interaction.reply("No stats.");
            }

            const perk = d.double_stats_until > Date.now() ? "Active ✅" : "Inactive ❌";

            const statEmbed = createEmbed(`📊 Stats: ${target.username}`, "");

            statEmbed.addFields(
                { name: 'Balance', value: `${d.balance} Coins`, inline: true },
                { name: 'Double Stats', value: perk, inline: true },
                { name: 'Weekly Cooks', value: `${d.cook_count_week}`, inline: true },
                { name: 'Weekly Deliveries', value: `${d.deliver_count_week}`, inline: true }
            );

            return interaction.reply({ 
                embeds: [statEmbed] 
            });

        }

        // --- GEN CODES ---
        if (commandName === 'generate_codes') {

            if (!perms.isOwner) return interaction.reply("Denied.");

            const amount = interaction.options.getInteger('amount');

            let codes = [];

            for (let i = 0; i < amount; i++) {
                const c = generateCode();
                codes.push(c);
                await new PremiumCode({ code: c, created_by: interaction.user.id }).save();
            }

            return interaction.reply({ 
                content: `Generated:\n${codes.join('\n')}`, 
                ephemeral: true 
            });

        }

        // --- REDEEM ---
        if (commandName === 'redeem') {

            const code = interaction.options.getString('code');

            const c = await PremiumCode.findOne({ 
                code, 
                status: 'unused' 
            });

            if (!c) {
                return interaction.reply("Invalid code.");
            }

            c.status = 'used'; 

            await c.save();

            await PremiumUser.findOneAndUpdate(
                { user_id: interaction.user.id }, 
                { 
                    is_vip: true, 
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
                }, 
                { upsert: true }
            );

            return interaction.reply("💎 VIP Redeemed!");

        }

        if (['claim', 'cook'].includes(commandName)) {

            if (interaction.channelId !== CHANNELS.COOK && !perms.isManager && !perms.isOwner) {

                return interaction.reply({ 
                    embeds: [createEmbed("❌ Wrong Channel", `Use <#${CHANNELS.COOK}>.`, ERROR_COLOR)], 
                    ephemeral: true 
                });

            }

        }

        if (commandName === 'deliver') {

            if (interaction.channelId !== CHANNELS.DELIVERY && !perms.isManager && !perms.isOwner) {

                return interaction.reply({ 
                    embeds: [createEmbed("❌ Wrong Channel", `Use <#${CHANNELS.DELIVERY}>.`, ERROR_COLOR)], 
                    ephemeral: true 
                });

            }

        }

        const restricted = [
            'warn', 'fdo', 'force_warn', 'unban', 'vacation', 'quota', 'stats', 
            'runquota', 'addvip', 'removevip', 'generate_codes', 'setscript', 
            'orderlist', 'blacklist_server', 'unblacklist_server'
        ];

        if (restricted.includes(commandName)) {

            if (interaction.guildId !== SUPPORT_SERVER_ID && !perms.isOwner) {

                return interaction.reply({ 
                    embeds: [createEmbed("❌ Restricted", "Support Server only.", ERROR_COLOR)], 
                    ephemeral: true 
                });

            }

        }

    }

    if (interaction.isButton()) {

        if (!perms.isManager && !perms.isOwner) {
            return interaction.reply({ 
                embeds: [createEmbed("❌ Access Denied", "Managers only.", ERROR_COLOR)], 
                ephemeral: true 
            });
        }

        const [action, userId, daysStr] = interaction.customId.split('_');

        const days = parseInt(daysStr);

        if (action === 'vacApprove') {

            const endDate = new Date();

            endDate.setDate(endDate.getDate() + days);

            await Vacation.findOneAndUpdate({ user_id: userId }, { status: 'active', end_date: endDate }, { upsert: true });

            const supportGuild = client.guilds.cache.get(SUPPORT_SERVER_ID);

            if (supportGuild) {

                const target = await supportGuild.members.fetch(userId).catch(() => null);

                if (target) {
                    target.roles.add(ROLES.BYPASS).catch(() => {});
                }

            }

            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(SUCCESS_COLOR)
                .setFooter({ 
                    text: `Approved by ${interaction.user.username}` 
                });

            await interaction.message.edit({ 
                embeds: [embed], 
                components: [] 
            });

            await interaction.reply({ 
                embeds: [createEmbed("✅ Approved", `Vacation approved.`, SUCCESS_COLOR)], 
                ephemeral: true 
            });

        }

        return;

    }

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const { commandName } = interaction;

    if (commandName === 'order') {

        const item = interaction.options.getString('item');

        const oid = Math.random().toString(36).substring(2, 8).toUpperCase();

        const cost = isVIP ? 50 : 100;

        if (uData.balance < cost) {
            return interaction.reply({ 
                content: `❌ Need **${cost} Coins**.`, 
                ephemeral: true 
            });
        }

        const active = await Order.findOne({ 
            user_id: interaction.user.id, 
            status: { $in: ['pending', 'claimed', 'cooking', 'ready'] } 
        });

        if (active) {
            return interaction.reply({ 
                embeds: [createEmbed("❌ Active order exists.", "", ERROR_COLOR)], 
                ephemeral: true 
            });
        }

        const eta = await calculateETA();

        uData.balance -= cost; 

        await uData.save();

        await new Order({ 
            order_id: oid, user_id: interaction.user.id, guild_id: interaction.guild.id, 
            channel_id: interaction.channel.id, item: item, is_vip: isVIP 
        }).save();

        updateMasterLog(oid);

        client.channels.cache.get(CHANNELS.COOK)?.send({ 
            content: isVIP ? "@here" : "", 
            embeds: [createEmbed(isVIP ? "💎 VIP ORDER" : "🍩 NEW ORDER", `**Item:** ${item}\n**ID:** \`${oid}\``, isVIP ? 0x9B59B6 : BRAND_COLOR)] 
        });

        await interaction.reply({ 
            embeds: [createEmbed("✅ Order Placed", `ID: \`${oid}\`. ETA: ${eta}`, SUCCESS_COLOR)], 
            ephemeral: true 
        });

    }

    if (commandName === 'claim') {

        if (!perms.isStaff) {
            return interaction.reply("Denied.");
        }

        const oid = interaction.options.getString('id');

        const order = await Order.findOne({ 
            order_id: oid, 
            status: 'pending' 
        });

        if (!order) {
            return interaction.reply("Invalid.");
        }

        order.status = 'claimed'; 

        order.chef_name = interaction.user.username; 

        order.chef_id = interaction.user.id;

        await order.save(); 

        updateMasterLog(oid);

        await interaction.reply({ 
            content: `✅ Claimed \`${oid}\`.` 
        });

    }

    if (commandName === 'cook') {

        if (!perms.isStaff) {
            return interaction.reply("Denied.");
        }

        const oid = interaction.options.getString('id');

        const img = interaction.options.getAttachment('image');

        const link = interaction.options.getString('link');

        const order = await Order.findOne({ 
            order_id: oid, 
            status: 'claimed' 
        });

        if (!order || order.chef_id !== interaction.user.id) {
            return interaction.reply("Invalid.");
        }

        order.status = 'cooking'; 

        order.images = [img?.url || link]; 

        await order.save();

        await interaction.reply({ 
            content: `👨‍🍳 Cooking \`${oid}\` (3m)...` 
        });

        setTimeout(async () => {

            const o = await Order.findOne({ 
                order_id: oid, 
                status: 'cooking' 
            });

            if (o) {

                o.status = 'ready'; 

                o.ready_at = new Date(); 

                await o.save();

                const chefUser = await User.findOne({ 
                    user_id: o.chef_id 
                });

                const weight = (chefUser.double_stats_until > Date.now()) ? 2 : 1;

                chefUser.balance += 20; 

                chefUser.cook_count_week += weight; 

                await chefUser.save();

                client.channels.cache.get(CHANNELS.DELIVERY)?.send({ 
                    embeds: [createEmbed("📦 Order Ready", `ID: \`${oid}\``)] 
                });

                updateMasterLog(oid);

            }

        }, 180000); 

    }

    if (commandName === 'deliver') {

        if (!perms.isStaff) {
            return interaction.reply("Denied.");
        }

        const oid = interaction.options.getString('id');

        const order = await Order.findOne({ 
            order_id: oid, 
            status: 'ready' 
        });

        if (!order) {
            return interaction.reply("Invalid.");
        }

        const chan = client.guilds.cache.get(order.guild_id)?.channels.cache.get(order.channel_id);

        if (chan) {

            const embed = createEmbed("🚴 Order Delivered", "Enjoy!").setImage(order.images[0]);

            await chan.send({ 
                content: `<@${order.user_id}>`, 
                embeds: [embed] 
            });

            order.status = 'delivered'; 

            order.deliverer_id = interaction.user.id; 

            await order.save();

            const driverUser = await User.findOne({ 
                user_id: interaction.user.id 
            });

            const weight = (driverUser.double_stats_until > Date.now()) ? 2 : 1;

            driverUser.balance += 30; 

            driverUser.deliver_count_week += weight; 

            await driverUser.save();

            updateMasterLog(oid);

            return interaction.reply({ 
                content: "✅ Delivered! +30 Coins.", 
                ephemeral: true 
            });

        }

    }

});

client.login(BOT_TOKEN);
