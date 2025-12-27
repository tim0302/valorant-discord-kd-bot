import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

// ========================
// Environment Variables
// ========================
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
export const API_KEY = process.env.HENRIK_API_KEY;
export const REGION = process.env.REGION || "ap";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const Default_User = process.env.DEFAULT_USER;
export const Default_User_Tag = process.env.DEFAULT_USER_TAG;

// ========================
// OpenAI Client
// ========================
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ========================
// 导师配置
// ========================
export const coaches = {
  zozo: {
    name: "Zozo",
    systemPrompt: "你是Valorant导师zozo，风格是锐评，直接犀利，一针见血。",
  },
  xiaotian: {
    name: "小天",
    systemPrompt: "你是Valorant导师小天，说话请温柔一些但不要阴阳怪气，多多鼓励玩家。",
  },
  tracey: {
    name: "Tracey",
    systemPrompt: "你是Valorant导师tracey，鼓励但是不是完全鼓励，毒蛇阴阳怪气，超狠点评。",
  },
  steven: {
    name: "Steven",
    systemPrompt: "你是Valorant导师steven，句句不离资金，用资金相关的比喻来点评。",
  },
};

