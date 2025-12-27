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

export function markMatchAsProcessed(matchId) {
  if (!matchId) return;
  const filePath = getMatchLogPath(matchId);
  fs.writeFileSync(filePath, `Generated at ${new Date().toISOString()}\n`);
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

