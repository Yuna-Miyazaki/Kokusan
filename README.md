# Saudade

「帰りたい。でも、完全には帰れない。」をテーマにした、AIハッカソン向けの体験型Webアプリです。

ユーザーが「帰りたい」と声に出し、帰りたい理由を神様に伝えると、Gemini API が Saudade の強さと帰る先を解析し、記憶の風景を画像として生成します。滞在できる時間は最大7秒だけです。

## 技術構成

- Frontend: React + Vite
- Backend: Node.js + Express
- AI: Google Gemini API
- 音声認識: Web Speech API
- 画像生成: Gemini Image API
- Deploy: Render Web Service

## ローカル実行

```bash
npm install
cp .env.example .env
```

`.env` に Gemini API キーを設定します。

```bash
GEMINI_API_KEY=...
```

開発サーバーを起動します。

```bash
npm run dev
```

フロントエンドは `http://localhost:5173`、API は `http://localhost:3001` で動きます。Vite の proxy により `/api` は Express に転送されます。

## Production Build

```bash
npm run build
npm start
```

production では Express が `dist` を配信し、1つのWeb Serviceとして動作します。

## Render デプロイ

1. このディレクトリを GitHub Repository に push します。
2. Render で New Web Service を作成し、GitHub Repository を接続します。
3. `render.yaml` を使う場合は Blueprint として作成します。
4. Environment Variables に `GEMINI_API_KEY` を設定します。
5. Build Command は `npm install && npm run build`、Start Command は `npm start` です。

APIキーは必ずサーバー側の環境変数として設定してください。React 側には公開されません。

## API

`POST /api/analyze-saudade`

Request:

```json
{
  "reason": "もう会えない祖父と、もう一度あの縁側で話したい。"
}
```

Response:

```json
{
  "saudadeScore": 108,
  "destinationTitle": "祖父と過ごした夏の縁側",
  "destinationDescription": "...",
  "imagePrompt": "...",
  "imageUrl": "..."
}
```
