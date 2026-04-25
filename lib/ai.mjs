/**
 * Claude API で受講生のメッセージに対する回答を生成する
 * システムプロンプトはスプシから取得したものを受け取る
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(import.meta.url.replace("file://", "")), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function truncateText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

/**
 * 受講生のメッセージに対する回答を生成する
 * @param {string} userMessage - 受講生のメッセージ
 * @param {string} systemPrompt - スプシから取得したシステムプロンプト
 * @param {Array} knowledge - スプシから取得したQ&Aペア
 * @param {Array} recentMessages - 直近の会話履歴
 */
export async function generateReply(userMessage, systemPrompt, knowledge = [], recentMessages = []) {
  const trimmedKnowledge = knowledge
    .slice(-12)
    .map((qa) => ({
      question: truncateText(qa.question, 120),
      answer: truncateText(qa.answer, 280),
    }));

  const knowledgeContext = trimmedKnowledge.length > 0
    ? `\n\n## 参考: ナレッジベース\n${trimmedKnowledge
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join("\n---\n")}`
    : "";

  const conversationContext = recentMessages.length > 0
    ? `\n\n## 直近の会話履歴\n${recentMessages
      .slice(-8)
      .map((m) => `${m.role}: ${truncateText(m.content, 180)}`)
      .join("\n")}`
    : "";

  const fullSystemPrompt = truncateText(
    systemPrompt + knowledgeContext + conversationContext,
    12000
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 700,
    system: fullSystemPrompt,
    messages: [
      { role: "user", content: userMessage },
    ],
  });

  return response.content[0].text;
}
