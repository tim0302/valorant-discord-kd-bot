
import fs from "fs";
import path from "path";
import axios from "axios";
import OpenAI from "openai";

import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const API_KEY = process.env.HENRIK_API_KEY;
const REGION = process.env.REGION || "ap";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const Default_User = process.env.DEFAULT_USER;
const Default_User_Tag = process.env.DEFAULT_USER_TAG;

let lastMatchId = null;
let isChecking = false;

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
// Match Processing Helpers
// ========================

function getMatchLogPath(matchId) {
  const dir = path.resolve("./match_logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${REGION}_${matchId}.txt`);
}

function isMatchProcessed(matchId) {
  if (!matchId) return false;
  const filePath = getMatchLogPath(matchId);
  return fs.existsSync(filePath);
}

function markMatchAsProcessed(matchId) {
  if (!matchId) return;
  const filePath = getMatchLogPath(matchId);
  fs.writeFileSync(filePath, `Generated at ${new Date().toISOString()}\n`);
}

async function fetchMatches(username, tag) {
  const usernameToUse = username ?? Default_User;
  const tagToUse = tag ?? Default_User_Tag;
  try {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/${REGION}/${usernameToUse}/${tagToUse}`;
    console.log(url);
    const res = await axios.get(url, {
      headers: { Authorization: `${API_KEY}` },
    });

    const matches = res.data?.data || [];
    if (!matches.length) return null;

    return matches[0]; // Return the latest match
  } catch (err) {
    console.error("获取比赛数据失败:", err);
    return null;
  }
}

// ========================
// 获取玩家最近比赛 K/D
// ========================

function getEvaluation(kd, headShotRate, legShots, totalShots) {
  let evaluation = "";

  if (kd < 0.2) {
    evaluation = "📘 本局主要贡献是参与比赛气氛建设";
  } else if (kd < 0.4) {
    evaluation = "📘 战斗参与度很高，击杀转化率有待研究";
  } else if (kd < 0.6) {
    evaluation = "📘 偶有高光，但大多发生在回放里";
  } else if (kd < 0.8) {
    evaluation = "📘 基本完成任务，属于“不会被点名”的类型";
  } else if (kd < 1.0) {
    evaluation = "📘 表现稳定，已经开始影响战局走向";
  } else if (kd < 1.3) {
    evaluation = "📘 输出在线，对面开始认真对待你了";
  } else if (kd < 1.6) {
    evaluation = "📘 状态火热，本局允许你指点队友";
  } else {
    evaluation = "📘 表现异常稳定，建议截图保存";
  }

  if (kd >= 1.0 && headShotRate < 15) {
    evaluation += "（输出在线，但爆头主要靠缘分）";
  } else if (headShotRate >= 30) {
    evaluation += "（对面头部压力过大）";
  } else if (legShots / totalShots > 0.35) {
    evaluation += "（裤裆磁铁认证）";
  } else if (kd < 0.8 && headShotRate >= 25) {
    evaluation += "（方向是对的）";
  } else if (kd >= 1.2 && headShotRate < 12) {
    evaluation += "（过程不太讲究，但结果很美）";
  }

  return evaluation;
}

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
      //move these up as well
      const legShots = p.stats.legshots;
      const bodyShots = p.stats.bodyshots;
      const headShots = p.stats.headshots;
      const totalShots = bodyShots + legShots + headShots;

      const headShotRate = ((headShots * 100) / totalShots).toFixed(2);
      const legShotRate = ((legShots * 100) / totalShots).toFixed(2);

      const evaluation = await generateCoachReview(
        kd,
        headShotRate,
        legShots,
        totalShots,
        kills,
        deaths,
        assists,
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

async function generateCoachReview(kd, headShotRate, legShots, totalShots, kills, deaths, assists) {
  const prompt = `
你是一个幽默风趣但专业的Valorant导师-zozo。
根据以下玩家数据生成1-2句点评：

爆头率: ${headShotRate}%
击杀: ${kills}
死亡: ${deaths}
助攻: ${assists}

要求：短小精悍、幽默搞笑、带导师点评风格。
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "你是Valorant导师-zozo，写幽默点评。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 120,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("生成点评失败:", err);
    return "点评生成失败";
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

    console.log(reports);
    const embeds = reports.map((p) => buildPlayerEmbed(p, gameMode));

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({
      content: "📢 zozo导师：检测到新比赛已结束",
      embeds,
    });
  } catch (err) {
    console.error("自动检测比赛失败:", err);
  } finally {
    isChecking = false;
  }
}

function buildPlayerEmbed(teamReport, gameMode) {
  return new EmbedBuilder()
    .setTitle(`${teamReport.name}`)
    .setDescription(`模式：**${gameMode}**`)
    .setColor(teamReport.team === "Blue" ? 0x3498db : 0xe74c3c) // 蓝队/红队
    .setThumbnail(teamReport.agentThumbnail) // 英雄头像
    .addFields(
      { name: "📊 数据", value: `**${teamReport.kda}**`, inline: true },
      { name: "🎯 爆头率", value: `${teamReport.headShotRate}%`, inline: true },
      {
        name: "🦵 裤裆命中率",
        value: `${teamReport.legShotRate}%`,
        inline: true,
      },
      { name: "🏆 金牌导师评价", value: teamReport.evaluation }
    )
    .setFooter({ text: "Valorant 导师zozo · 名师评价" })
    .setTimestamp();
}

client.login(DISCORD_TOKEN);
