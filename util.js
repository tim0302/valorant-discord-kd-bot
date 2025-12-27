import fs from "fs";
import path from "path";
import axios from "axios";
import { EmbedBuilder } from "discord.js";
import { REGION, API_KEY, Default_User, Default_User_Tag, openai, coaches } from "./const.js";

// ========================
// Match Processing Helpers
// ========================

export function getMatchLogPath(matchId) {
  const dir = path.resolve("./match_logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${REGION}_${matchId}.txt`);
}

export function isMatchProcessed(matchId) {
  if (!matchId) return false;
  const filePath = getMatchLogPath(matchId);
  return fs.existsSync(filePath);
}

export function markMatchAsProcessed(matchId, reports = null) {
  if (!matchId) return;
  const filePath = getMatchLogPath(matchId);
  const timestamp = new Date().toISOString();
  
  let content = `Generated at ${timestamp}\n`;
  
  // Record key statistics for each player
  if (reports && Array.isArray(reports)) {
    content += `\n=== Match Statistics ===\n`;
    reports.forEach((report) => {
      content += `\nPlayer: ${report.name}\n`;
      content += `K/D: ${report.kd}\n`;
      content += `Kills: ${report.kills}\n`;
      content += `Deaths: ${report.deaths}\n`;
      content += `Assists: ${report.assists}\n`;
      content += `KDA: ${report.kda}\n`;
      content += `Headshot Rate: ${report.headShotRate}%\n`;
      content += `Legshot Rate: ${report.legShotRate}%\n`;
      content += `Total Shots: ${report.totalShots}\n`;
      content += `Headshots: ${report.headShots || 0}\n`;
      content += `Body Shots: ${report.bodyShots || 0}\n`;
      content += `Legshots: ${report.legShots}\n`;
      content += `Character: ${report.character}\n`;
      content += `---\n`;
    });
  }
  
  fs.writeFileSync(filePath, content);
}

export async function fetchMatches(username, tag) {
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
// Evaluation Helpers
// ========================

export function getEvaluation(kd, headShotRate, legShots, totalShots) {
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

// ========================
// Coach Helpers
// ========================

export function getRandomCoach() {
  const coachKeys = Object.keys(coaches);
  const randomKey = coachKeys[Math.floor(Math.random() * coachKeys.length)];
  return coaches[randomKey];
}

export async function generateCoachReview(kd, headShotRate, legShots, totalShots, kills, deaths, assists, character) {
  // 随机选择一个导师
  const coach = getRandomCoach();
  
  const prompt = `
你是导师${coach.name}，请在点评开头来一句：
"我是导师${coach.name}"

根据以下玩家数据生成1-2句点评：

爆头率: ${headShotRate}%
击杀: ${kills}
死亡: ${deaths}
助攻: ${assists}
腿部命中: ${legShots}
爆头率在20%就很高了
击杀/死亡在1.0以上就不错了 在2以上就很强了
要求：短小精悍、幽默搞笑、带导师点评风格。
附带${character}的角色特性进行点评
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: coach.systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("生成点评失败:", err);
    return "点评生成失败";
  }
}

// ========================
// Discord Embed Helpers
// ========================

export function buildPlayerEmbed(teamReport, gameMode) {
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
    .setFooter({ text: "Valorant 金牌导师 · 名师评价" })
    .setTimestamp();
}

// ========================
// Fortune Prediction
// ========================

// ========================
// Statistics & Top Records
// ========================

export function getTodayLogFiles() {
  const dir = path.resolve("./match_logs");
  if (!fs.existsSync(dir)) {
    return [];
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const files = fs.readdirSync(dir);
  const todayFiles = files.filter(file => {
    if (!file.endsWith('.txt')) return false;
    
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    const fileDate = new Date(stats.mtime).toISOString().split('T')[0];
    
    return fileDate === todayStr;
  });

  return todayFiles.map(file => path.join(dir, file));
}

export function parseLogFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const stats = [];
    let currentPlayer = null;
    
    for (const line of lines) {
      if (line.startsWith('Player:')) {
        if (currentPlayer) {
          stats.push(currentPlayer);
        }
        currentPlayer = { name: line.replace('Player:', '').trim() };
      } else if (line.startsWith('K/D:')) {
        if (currentPlayer) {
          currentPlayer.kd = parseFloat(line.replace('K/D:', '').trim());
        }
      } else if (line.startsWith('Kills:')) {
        if (currentPlayer) {
          currentPlayer.kills = parseInt(line.replace('Kills:', '').trim());
        }
      } else if (line.startsWith('Deaths:')) {
        if (currentPlayer) {
          currentPlayer.deaths = parseInt(line.replace('Deaths:', '').trim());
        }
      } else if (line.startsWith('Assists:')) {
        if (currentPlayer) {
          currentPlayer.assists = parseInt(line.replace('Assists:', '').trim());
        }
      } else if (line.startsWith('Headshot Rate:')) {
        if (currentPlayer) {
          currentPlayer.headShotRate = parseFloat(line.replace('Headshot Rate:', '').replace('%', '').trim());
        }
      } else if (line.startsWith('Legshot Rate:')) {
        if (currentPlayer) {
          currentPlayer.legShotRate = parseFloat(line.replace('Legshot Rate:', '').replace('%', '').trim());
        }
      } else if (line.startsWith('Total Shots:')) {
        if (currentPlayer) {
          currentPlayer.totalShots = parseInt(line.replace('Total Shots:', '').trim());
        }
      } else if (line.startsWith('Headshots:')) {
        if (currentPlayer) {
          currentPlayer.headshots = parseInt(line.replace('Headshots:', '').trim());
        }
      } else if (line.startsWith('Legshots:')) {
        if (currentPlayer) {
          currentPlayer.legshots = parseInt(line.replace('Legshots:', '').trim());
        }
      } else if (line.startsWith('Character:')) {
        if (currentPlayer) {
          currentPlayer.character = line.replace('Character:', '').trim();
        }
      }
    }
    
    if (currentPlayer) {
      stats.push(currentPlayer);
    }
    
    return stats;
  } catch (err) {
    console.error(`Error parsing log file ${filePath}:`, err);
    return [];
  }
}

export function getTodayTopStats() {
  const logFiles = getTodayLogFiles();
  const allStats = [];
  
  // Parse all log files
  for (const filePath of logFiles) {
    const stats = parseLogFile(filePath);
    allStats.push(...stats);
  }
  
  if (allStats.length === 0) {
    return null;
  }
  
  // Find top records
  const topStats = {
    bestKD: null,
    highestKills: null,
    highestHeadshotRate: null,
    highestAssists: null,
    mostHeadshots: null,
  };
  
  for (const stat of allStats) {
    // Best K/D
    if (!topStats.bestKD || stat.kd > topStats.bestKD.kd) {
      topStats.bestKD = stat;
    }
    
    // Highest Kills
    if (!topStats.highestKills || stat.kills > topStats.highestKills.kills) {
      topStats.highestKills = stat;
    }
    
    // Highest Headshot Rate
    if (!topStats.highestHeadshotRate || stat.headShotRate > topStats.highestHeadshotRate.headShotRate) {
      topStats.highestHeadshotRate = stat;
    }
    
    // Highest Assists
    if (!topStats.highestAssists || stat.assists > topStats.highestAssists.assists) {
      topStats.highestAssists = stat;
    }
    
    // Most Headshots
    if (!topStats.mostHeadshots || (stat.headshots || 0) > (topStats.mostHeadshots.headshots || 0)) {
      topStats.mostHeadshots = stat;
    }
  }
  
  return topStats;
}

export async function generateFortune(userName) {
  const today = new Date().toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });

  const prompt = `
为玩家 ${userName} 生成今日（${today}）的 Valorant 游戏运势预测。

要求：
1. 包含今日整体运势（大吉/中吉/小吉/平/小凶/中凶/大凶）
2. 预测今日适合使用的特工（推荐2-3个）
3. 预测今日游戏表现（K/D、爆头率等）
4. 给出今日游戏建议和注意事项
5. 风格要幽默风趣，带有玄学占卜的感觉
6. 控制在150字以内，格式清晰易读

请用中文生成，风格可以参考塔罗牌占卜或星座运势。
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { 
          role: "system", 
          content: "你是一个专业的Valorant游戏战术推荐师，擅长用幽默风趣的方式预测游戏运势，风格类似塔罗牌占卜。" 
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 200,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("生成运势失败:", err);
    return "运势生成失败，请稍后再试";
  }
}

