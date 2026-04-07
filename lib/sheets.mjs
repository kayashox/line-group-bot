/**
 * Google Sheets 認証・3シートの読み書きヘルパー
 * - システムプロンプト: A1セルから全文読み込み（5分キャッシュ）
 * - ナレッジ: Q&Aペア読み込み（5分キャッシュ）
 * - 会話履歴: 読み書き（毎回リアルタイム）
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

const PROJECT_ROOT = join(dirname(import.meta.url.replace("file://", "")), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TOKENS_PATH =
  process.env.GOOGLE_TOKENS_PATH || join(PROJECT_ROOT, "credentials", "tokens.json");

// キャッシュ（5分間）
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = {
  systemPrompt: { value: null, fetchedAt: 0 },
  knowledge: { value: null, fetchedAt: 0 },
};

let _sheets;
async function getSheets() {
  if (_sheets) return _sheets;

  if (!SPREADSHEET_ID) {
    throw new Error("SPREADSHEET_ID が .env に設定されていません");
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が .env に設定されていません");
  }
  if (!existsSync(TOKENS_PATH)) {
    throw new Error(`トークンファイルが見つかりません: ${TOKENS_PATH}`);
  }

  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(tokens);
  _sheets = google.sheets({ version: "v4", auth: client });
  return _sheets;
}

/**
 * システムプロンプトを取得（A1セルから全文、5分キャッシュ）
 */
export async function fetchSystemPrompt() {
  const now = Date.now();
  if (cache.systemPrompt.value && now - cache.systemPrompt.fetchedAt < CACHE_TTL_MS) {
    return cache.systemPrompt.value;
  }

  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'システムプロンプト'!A1",
  });

  const prompt = res.data.values?.[0]?.[0] || "";
  cache.systemPrompt = { value: prompt, fetchedAt: now };
  return prompt;
}

/**
 * ナレッジ（Q&Aペア）を取得（5分キャッシュ）
 */
export async function fetchKnowledge() {
  const now = Date.now();
  if (cache.knowledge.value && now - cache.knowledge.fetchedAt < CACHE_TTL_MS) {
    return cache.knowledge.value;
  }

  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'ナレッジ'!A2:C",
  });

  const rows = res.data.values || [];
  const qaPairs = rows
    .filter((row) => row[1] && row[2])
    .map((row) => ({ category: row[0] || "", question: row[1], answer: row[2] }));

  cache.knowledge = { value: qaPairs, fetchedAt: now };
  return qaPairs;
}

/**
 * 会話履歴を取得（グループID指定、直近N件）
 */
export async function fetchHistory(groupId, limit = 10) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'会話履歴'!A2:E",
  });

  const rows = res.data.values || [];
  const filtered = rows
    .filter((row) => row[1] === groupId)
    .map((row) => ({ role: row[3], content: row[4] }));

  return filtered.slice(-limit);
}

/**
 * 会話履歴にメッセージを追記する
 */
export async function appendHistory(groupId, userId, role, message) {
  const sheets = await getSheets();
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "'会話履歴'!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[now, groupId, userId, role, message]],
    },
  });
}
