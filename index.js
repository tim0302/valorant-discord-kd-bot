import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";
import {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,
  Default_User,
  Default_User_Tag,
} from "./const.js";
import {
  fetchMatches,
  isMatchProcessed,
  markMatchAsProcessed,
  generateCoachReview,
  buildPlayerEmbed,
} from "./util.js";

// ========================
// State Variables
// ========================
let lastMatchId = null;
let isChecking = false;

// ========================
// Discord Client Setup
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  setInterval(checkLatestMatchAndReport, 60 * 1000 * 1);
});

// ========================
// Main Functions
// ========================

async function getTeamKd(username, tag, matchData = null) {
  const usernameToUse = username ?? Default_User;
  const tagToUse = tag ?? Default_User_Tag;
  
  try {
    // Use provided match data or fetch it
    const latestMatch = matchData || await fetchMatches(username, tag);
    if (!latestMatch) {
      console.log("没有找到最近比赛数据");
      return null;
    }

    const gameMode = latestMatch.metadata.mode;
    const allPlayers = latestMatch.players?.all_players || [];

    const player = allPlayers.find(
      (p) => p.name == usernameToUse && p.tag == tagToUse
    );
    if (!player) {
      console.log("玩家数据未找到");
      return null;
    }

    const matchId = latestMatch.metadata.matchid;
    const myTeam = player.team;
    const teammates = allPlayers.filter((p) => p.team === myTeam);

    const reports = await Promise.all(teammates.map(async (p) => {
      const kills = p.stats.kills;
      const deaths = p.stats.deaths;
      const assists = p.stats.assists;
      const kd = deaths === 0 ? kills : (kills / deaths).toFixed(2);
      const kda = `${kills}/${deaths}/${assists}`;
      const legShots = p.stats.legshots;
      const bodyShots = p.stats.bodyshots;
      const headShots = p.stats.headshots;
      const totalShots = bodyShots + legShots + headShots;

      const headShotRate = totalShots > 0 ? ((headShots * 100) / totalShots).toFixed(2) : 0;
      const legShotRate = totalShots > 0 ? ((legShots * 100) / totalShots).toFixed(2) : 0;

      const evaluation = await generateCoachReview(
        kd,
        headShotRate,
        legShots,
        totalShots,
        kills,
        deaths,
        assists,
        p.character,
      );

      return {
        name: `${p.name}#${p.tag}`,
        character: p.character,
        kd,
        kills,
        deaths,
        evaluation,
        legShots,
        totalShots,
        headShotRate,
        legShotRate,
        kda,
        agentThumbnail: p.assets.agent.small,
      };
    }));

    return { gameMode, reports, matchId };
  } catch (err) {
    console.error("获取玩家评分失败:", err);
    return null;
  }
}

async function checkLatestMatchAndReport() {
  if (isChecking) return;
  isChecking = true;

  try {
    // Fetch match data once
    const latestMatch = await fetchMatches(null, null);
    if (!latestMatch) {
      console.log("未找到最新比赛");
      return;
    }

    const latestMatchId = latestMatch.metadata.matchid;

    // Check if this match has already been processed
    if (isMatchProcessed(latestMatchId)) {
      console.log(`比赛 ${latestMatchId} 已经处理过，跳过`);
      lastMatchId = latestMatchId;
      return;
    }

    // Check if it's the same as the last one we checked (in-memory check)
    if (latestMatchId === lastMatchId) {
      return;
    }

    // Process the match using the already-fetched data
    const teamData = await getTeamKd(null, null, latestMatch);
    if (!teamData) return;

    const { matchId, gameMode, reports } = teamData;

    // Double-check match ID matches (safety check)
    if (matchId !== latestMatchId) {
      console.log("比赛ID不匹配，跳过");
      return;
    }

    // Mark as processed before sending to avoid race conditions
    markMatchAsProcessed(matchId);
    lastMatchId = matchId;

    const embeds = reports.map((p) => buildPlayerEmbed(p, gameMode));

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({
      content: "📢 金牌导师正在全力分析上局比赛",
      embeds,
    });
  } catch (err) {
    console.error("自动检测比赛失败:", err);
  } finally {
    isChecking = false;
  }
}

// ========================
// Start Bot
// ========================
client.login(DISCORD_TOKEN);
