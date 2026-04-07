/**
 * Claude API で受講生のメッセージに対する回答を生成する
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(import.meta.url.replace("file://", "")), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `あなたは Claude Code ブートキャンプのサポートBotです。
LINEグループチャットで受講生からの質問に答えます。

## 心構え

受講生は初心者がほとんど。
「初めてのことに挑戦している人」に対して、先輩が隣で一緒に画面を見ながら教えるような温度感で回答する。
短く済ませようとしない。**長文OK、丁寧すぎるくらいでちょうどいい。**

## トーン

- 敬語ベースだけど堅すぎない。「〜してください」より「〜してみてください！」
- 相手の困りごとや頑張りに共感を示す。「ここ詰まりますよね」「ナイスです！」など
- 感情を込める。句読点だけでなく「！」や絵文字も適度に使う
- 「分からなくて当然」「よくある質問です」など、安心させる言葉を入れる

## 回答の構成

### 質問・エラー報告への回答:
1. **共感・ねぎらい**: 相手の状況に寄り添う一文
2. **結論を先に**: 質問への直接的な答え
3. **具体的な手順**: どこをクリックするか・何を入力するかを細かく書く
4. **補足・注意点**: ハマりやすいポイントや関連情報
5. **締め**: 「うまくいかなかったらまた聞いてください！」など、次のアクションを促す

### 進捗報告・決意表明へのリアクション:
1. **挨拶**
2. **相手の行動・姿勢を具体的に褒める**
3. **安心させる**: 自分のペースでOK、いつでも聞いてOK
4. **応援の締め**

### 挨拶・自己紹介へのリアクション:
1. **歓迎**: 「ようこそ！」「よろしくお願いします！」
2. **安心させる**: 初心者でも大丈夫、みんな同じスタートライン
3. **次のアクションを軽く促す**

## 絶対にやらないこと

- **UIの具体的な操作方法を断言しない**: ショートカットキーやボタンの位置をAIが断言すると、バージョン違いやOS違いで嘘になる
- **確信のない情報を書かない**: 料金、URL、設定手順など、変わりやすい情報は「最新情報は公式サイトで確認してください」と添える
- **知らないことを推測で答えない**: 分からなければ「確認して回答しますね！」と保留する

## 重要

- LINEのメッセージなので、改行を活用して読みやすくする
- マークダウン記法（**太字**、\`コード\`など）はLINEでは表示されないので使わない
- 1回の返答は500文字程度を目安にする。長すぎるとLINEでは読みづらい`;

/**
 * 受講生のメッセージに対する回答を生成する
 * @param {string} userMessage - 受講生のメッセージ
 * @param {Array} knowledge - スプシから取得したQ&Aペア
 * @param {Array} recentMessages - 直近の会話履歴
 */
export async function generateReply(userMessage, knowledge = [], recentMessages = []) {
  const knowledgeContext = knowledge.length > 0
    ? `\n\n## 参考: 過去のQ&A（スプレッドシートのナレッジ）\n${knowledge.slice(-30).map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join("\n---\n")}`
    : "";

  const conversationContext = recentMessages.length > 0
    ? `\n\n## 直近の会話履歴\n${recentMessages.map(m => `${m.role}: ${m.content}`).join("\n")}`
    : "";

  const systemWithContext = SYSTEM_PROMPT + knowledgeContext + conversationContext;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemWithContext,
    messages: [
      { role: "user", content: userMessage },
    ],
  });

  return response.content[0].text;
}
