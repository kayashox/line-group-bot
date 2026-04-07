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

// 既知のシート名をキャッシュ（存在確認の重複APIコールを防ぐ）
const knownSheets = new Set();

/**
 * グループ専用の会話履歴シートが存在するか確認し、なければ自動作成する
 * シート名は groupId をそのまま使う
 */
async function ensureHistorySheet(groupId) {
  if (knownSheets.has(groupId)) return;

  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });

  const existing = meta.data.sheets.map((s) => s.properties.title);
  if (existing.includes(groupId)) {
    knownSheets.add(groupId);
    return;
  }

  // シートを新規作成してヘッダーを書き込む
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: groupId } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${groupId}'!A1:D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["日時", "ユーザーID", "発言者", "メッセージ"]] },
  });

  knownSheets.add(groupId);
  console.log(`[sheets] 新しい会話履歴シートを作成: ${groupId}`);
}

/**
 * 会話履歴を取得（グループ専用シートから直近N件）
 */
export async function fetchHistory(groupId, limit = 10) {
  await ensureHistorySheet(groupId);

  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${groupId}'!A2:D`,
  });

  const rows = res.data.values || [];
  const messages = rows.map((row) => ({ role: row[2], content: row[3] }));

  return messages.slice(-limit);
}

/**
 * 会話履歴にメッセージを追記する（グループ専用シート）
 */
export async function appendHistory(groupId, userId, role, message) {
  await ensureHistorySheet(groupId);

  const sheets = await getSheets();
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${groupId}'!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[now, userId, role, message]],
    },
  });
}
