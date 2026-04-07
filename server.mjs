/**
 * LINE グループチャット Bot サーバー
 * 受講生のメッセージを受信し、Claude API で回答を生成してグループに返信する
 */

import express from "express";
import { messagingApi, middleware } from "@line/bot-sdk";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { generateReply } from "./lib/ai.mjs";
import { fetchKnowledge } from "./lib/sheets.mjs";

const PROJECT_ROOT = dirname(import.meta.url.replace("file://", ""));
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const app = express();

// ヘルスチェック（Render.com 用）
app.get("/", (req, res) => {
  res.json({ status: "ok", bot: "line-group-bot" });
});

// LINE Webhook エンドポイント
app.post("/webhook", middleware(config), async (req, res) => {
  res.status(200).json({ status: "ok" });

  const events = req.body.events || [];
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error("[handleEvent error]", err.message);
    }
  }
});

// 直近の会話履歴をグループごとに保持（メモリ内、再起動でリセット）
const conversationHistory = new Map();
const MAX_HISTORY = 20;

async function handleEvent(event) {
  // テキストメッセージ以外はスキップ
  if (event.type !== "message" || event.message.type !== "text") return;

  // グループチャット以外はスキップ（1対1トークでは動作しない）
  if (event.source.type !== "group") return;

  const userId = event.source.userId;
  const groupId = event.source.groupId;
  const text = event.message.text;
  const mention = event.message.mention;

  console.log(`[message] group=${groupId} user=${userId} text="${text.slice(0, 50)}"`);

  // 管理者（佐藤さん）のメッセージは無視
  if (userId === process.env.ADMIN_USER_ID) {
    console.log("[skip] 管理者のメッセージ");
    return;
  }

  // 佐藤さん宛のメンションが含まれている場合は無視
  if (mention && mention.mentionees) {
    const mentionedAdmin = mention.mentionees.some(
      (m) => m.userId === process.env.ADMIN_USER_ID
    );
    if (mentionedAdmin) {
      console.log("[skip] 管理者宛のメンション");
      return;
    }
  }

  // 会話履歴を取得・更新
  if (!conversationHistory.has(groupId)) {
    conversationHistory.set(groupId, []);
  }
  const history = conversationHistory.get(groupId);
  history.push({ role: "受講生", content: text });
  if (history.length > MAX_HISTORY) history.shift();

  // ナレッジを取得（エラーでも回答は試みる）
  let knowledge = [];
  try {
    knowledge = await fetchKnowledge();
  } catch (err) {
    console.error("[knowledge fetch error]", err.message);
  }

  // Claude API で回答生成
  const reply = await generateReply(text, knowledge, history.slice(-10));

  // 会話履歴にBotの回答を追加
  history.push({ role: "Bot", content: reply });
  if (history.length > MAX_HISTORY) history.shift();

  // LINE に返信
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: reply }],
  });

  console.log(`[reply] ${reply.slice(0, 80)}...`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`line-group-bot running on port ${PORT}`);
  console.log(`ADMIN_USER_ID: ${process.env.ADMIN_USER_ID || "(未設定 — 全メッセージに反応します)"}`);
});
