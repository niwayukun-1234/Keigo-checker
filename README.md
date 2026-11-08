# 敬語チェッカー

話したり打ったりした文章を、相手・丁寧度・送り先・トーン・長さに合わせて、そのまま送れる敬語に変換する自分用アプリ。
スマホ（ホーム画面に追加）と PC のブラウザで使える。

- 画面と変換サーバー: Next.js（Vercel で公開）
- 文章をつくる AI: Google Gemini API（無料枠）
- ログインと保存（連絡先・保存した条件・履歴・署名）: Supabase（無料プラン）

## はじめての設定（約15分）

### 1. Supabase

1. [Supabase](https://supabase.com/dashboard) で New project を作る（リージョンは Tokyo）。既存のプロジェクトに相乗りしてもよい（表はすべて `keigo_` で始まる名前なので重ならない）。
2. 左メニューの **SQL Editor** を開き、[`supabase/schema.sql`](supabase/schema.sql) の中身を貼り付けて **Run**。
3. **Project Settings → API** で次の 2 つを控える。
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key（または Publishable key）→ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. （おすすめ）**Authentication → Sign In / Providers → Email** の「Confirm email」をオフにすると、メール確認なしですぐログインできる。

### 2. Gemini の API キー

1. [Google AI Studio](https://aistudio.google.com/apikey) で **Create API key** を押す。
2. 表示されたキーを `GEMINI_API_KEY` として控える（他人に見せない）。

無料枠では、入力した文章が Google の改善に使われることがある。社外秘の内容は入れないこと。

### 3. Vercel

1. [Vercel](https://vercel.com/new) で GitHub の `keigo-checker` リポジトリを Import。
2. **Environment Variables** に次を入れて Deploy。

| 名前 | 値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 手順1で控えた URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 手順1で控えたキー |
| `GEMINI_API_KEY` | 手順2で控えたキー |
| `ALLOWED_EMAIL` | 自分のメールアドレス（これ以外のアカウントでは変換できない） |

### 4. 最初のログイン

1. 公開された URL を開き、「はじめての方：アカウントを作る」から自分のメールアドレスとパスワードで登録する。
2. 登録できたら、Supabase の **Authentication → Sign In / Providers** で「Allow new users to sign up」をオフにする（他人が登録できないようにする）。

### 5. スマホのホーム画面に追加

- iPhone: Safari で URL を開く → 共有ボタン → **ホーム画面に追加**。

アプリ内の「話して入力」ボタンが反応しないときは、キーボードのマイクボタンで話しても同じように使える。

## 手元で動かす

```bash
cp .env.example .env.local   # 値を入れる
npm install
npm run dev
```
