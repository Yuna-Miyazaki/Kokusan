import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const textModelFallbacks = [
  geminiTextModel,
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
].filter((model, index, models) => model && models.indexOf(model) === index);
const imageModelFallbacks = [
  geminiImageModel
].filter((model, index, models) => model && models.indexOf(model) === index);

const clampScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(120, Math.round(numeric)));
};

const extractJson = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini response did not contain JSON.");
    return JSON.parse(match[0]);
  }
};

const geminiGenerateContent = async ({ model, body, apiVersion = "v1beta" }) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini API request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
};

const geminiGenerateWithFallbacks = async ({ models, body, apiVersion = "v1beta", label }) => {
  let lastError;
  for (const model of models) {
    try {
      return {
        model,
        data: await geminiGenerateContent({ model, body, apiVersion })
      };
    } catch (error) {
      lastError = error;
      console.warn(`Gemini ${label} model failed (${model}):`, error.message);
    }
  }
  throw lastError;
};

const getGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
};

const getGeminiImageUrl = (data) => {
  const parts = data?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  const imagePart = parts.find((part) => part.inline_data?.data || part.inlineData?.data);
  const inline = imagePart?.inline_data || imagePart?.inlineData;
  if (!inline?.data) return "";
  const mimeType = inline.mime_type || inline.mimeType || "image/png";
  return `data:${mimeType};base64,${inline.data}`;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const makeFallbackMemory = (reason, overrides = {}) => {
  const text = reason || "";
  const hasGrandfather = /祖父|おじい|爺|じい/.test(text);
  const hasSoccer = /サッカー|ボール|蹴/.test(text);
  const hasDrive = /ドライブ|車|助手席|運転/.test(text);
  const hasMeal = /ご飯|食べ|食事|夕飯|朝ごはん|昼ごはん/.test(text);
  const hasAgain = /もう一度|また|帰りたい|戻りたい|会いたい/.test(text);

  const activityCount = [hasSoccer, hasDrive, hasMeal].filter(Boolean).length;
  const saudadeScore = clampScore(
    overrides.saudadeScore ?? 74 + (hasGrandfather ? 18 : 0) + activityCount * 6 + (hasAgain ? 8 : 0)
  );
  const destinationTitle = overrides.destinationTitle || (hasGrandfather
    ? "祖父と過ごす、もう一度だけの午後"
    : "もう一度だけ戻る、記憶の午後");
  const scenes = [
    hasSoccer ? "草の匂いが残る夕方の校庭で、古いボールがゆっくり転がっている" : "",
    hasDrive ? "窓の外に暮れかけた街並みが流れ、助手席にはあたたかな沈黙がある" : "",
    hasMeal ? "湯気の立つ食卓に、言いそびれた言葉だけが静かに残っている" : ""
  ].filter(Boolean);
  const destinationDescription = overrides.destinationDescription || (scenes.length
    ? `${scenes.join("。")}。それらは別々の願いではなく、祖父と過ごしたかった時間がひとつに溶けた記憶の風景です。`
    : "短い言葉の奥に、もう一度だけ触れたい時間への願いが残っています。");
  const imagePrompt = overrides.imagePrompt ||
    "A dreamlike nostalgic memory scene with an elderly grandfather presence, a quiet soccer field at dusk, a car interior glowing with evening light, and a warm family dinner table, cinematic dark blue atmosphere, soft particles, emotional saudade, no readable text.";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#071225"/>
      <stop offset="0.52" stop-color="#182945"/>
      <stop offset="1" stop-color="#05070d"/>
    </linearGradient>
    <radialGradient id="glow" cx="48%" cy="38%" r="48%">
      <stop offset="0" stop-color="#f6f0d8" stop-opacity="0.55"/>
      <stop offset="0.4" stop-color="#8fb0df" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft">
      <feGaussianBlur stdDeviation="2.8"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
  <circle cx="1230" cy="155" r="88" fill="#f2ddb0" opacity="0.42" filter="url(#soft)"/>
  <path d="M0 640 C220 560 360 610 540 570 C760 520 950 600 1160 548 C1340 504 1460 540 1600 500 L1600 900 L0 900 Z" fill="#101a23"/>
  <path d="M0 710 C240 650 420 704 630 662 C860 616 1040 702 1240 650 C1420 603 1510 632 1600 602 L1600 900 L0 900 Z" fill="#07100f"/>
  ${
    hasSoccer
      ? `<g opacity="0.86">
          <path d="M238 706 C352 672 478 674 586 715" stroke="#cbd8ea" stroke-opacity="0.35" stroke-width="5" fill="none"/>
          <circle cx="430" cy="704" r="33" fill="#e7ebf2" opacity="0.78"/>
          <path d="M397 704 H463 M430 671 V737 M407 681 L453 727 M453 681 L407 727" stroke="#24324a" stroke-opacity="0.52" stroke-width="5"/>
          <rect x="210" y="505" width="260" height="132" fill="none" stroke="#d6e4f6" stroke-opacity="0.22" stroke-width="7"/>
        </g>`
      : ""
  }
  ${
    hasDrive
      ? `<g opacity="0.78">
          <path d="M810 700 C930 620 1135 602 1268 685 L1320 759 C1164 793 958 796 760 760 Z" fill="#111927" stroke="#d5e4fb" stroke-opacity="0.2" stroke-width="6"/>
          <path d="M925 664 C1012 610 1136 618 1210 668 Z" fill="#88a5ce" opacity="0.22"/>
          <circle cx="895" cy="763" r="39" fill="#07090d"/>
          <circle cx="1214" cy="763" r="39" fill="#07090d"/>
          <path d="M760 600 C990 544 1236 526 1508 492" stroke="#f6dba6" stroke-opacity="0.22" stroke-width="8" fill="none"/>
        </g>`
      : ""
  }
  ${
    hasMeal
      ? `<g opacity="0.86">
          <ellipse cx="805" cy="742" rx="250" ry="72" fill="#584431" opacity="0.52"/>
          <ellipse cx="745" cy="718" rx="72" ry="22" fill="#f1e4cf" opacity="0.72"/>
          <ellipse cx="884" cy="718" rx="72" ry="22" fill="#f1e4cf" opacity="0.68"/>
          <path d="M710 682 C700 634 724 630 714 590 M820 680 C805 626 842 626 824 580 M918 682 C900 640 936 626 922 592" stroke="#f6f0df" stroke-opacity="0.32" stroke-width="9" fill="none" filter="url(#soft)"/>
        </g>`
      : ""
  }
  ${
    hasGrandfather
      ? `<g opacity="0.78">
          <circle cx="652" cy="530" r="42" fill="#d9d6d0"/>
          <path d="M602 632 C608 570 630 546 652 546 C682 546 704 576 710 632 Z" fill="#bac6d7" opacity="0.72"/>
          <circle cx="736" cy="552" r="28" fill="#f0d3b5" opacity="0.52"/>
          <path d="M708 634 C714 588 726 570 744 570 C766 570 785 592 790 634 Z" fill="#425772" opacity="0.58"/>
        </g>`
      : ""
  }
  <g opacity="0.35">
    <circle cx="190" cy="192" r="2.6" fill="#ffffff"/>
    <circle cx="310" cy="268" r="1.8" fill="#ffffff"/>
    <circle cx="520" cy="184" r="2.2" fill="#ffffff"/>
    <circle cx="930" cy="248" r="2.4" fill="#ffffff"/>
    <circle cx="1380" cy="230" r="2.1" fill="#ffffff"/>
    <circle cx="1180" cy="140" r="1.8" fill="#ffffff"/>
  </g>
  <rect width="1600" height="900" fill="#000" opacity="0.18"/>
  <text x="80" y="818" fill="#eef4ff" opacity="0.34" font-family="serif" font-size="32">${escapeHtml(destinationTitle)}</text>
</svg>`;

  return {
    saudadeScore,
    destinationTitle,
    destinationDescription,
    imagePrompt,
    imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    fallback: true
  };
};

app.post("/api/analyze-saudade", async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  try {
    if (!geminiApiKey) {
      return res.json(makeFallbackMemory(reason));
    }

    if (reason.length < 4) {
      return res.json(makeFallbackMemory(reason));
    }
    if (reason.length > 1800) {
      return res.status(400).json({
        error: "記憶をうまく読み取れませんでした。もう一度伝えてください。"
      });
    }

    const analysisResult = await geminiGenerateWithFallbacks({
      models: textModelFallbacks,
      label: "text",
      body: {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze this Japanese reason and create an image prompt.\n\nJapanese user text:\n${reason}`
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text:
                "You analyze Japanese writing about saudade: longing for a place, time, person, or moment that cannot fully return. Return only valid JSON with saudadeScore, destinationTitle, destinationDescription, and imagePrompt. Score 0-120 by attachment, time distance, loss, impossibility of return, separation, concrete sensory memory, and desire to experience it once more. imagePrompt must be English, cinematic, dreamlike, memory landscape, no text, no logos, no UI."
            }
          ]
        },
        generationConfig: {
          temperature: 0.85,
          responseMimeType: "application/json"
        }
      }
    });

    const analysisResponse = analysisResult.data;
    const parsed = extractJson(getGeminiText(analysisResponse) || "{}");
    const saudadeScore = clampScore(parsed.saudadeScore);
    const destinationTitle =
      typeof parsed.destinationTitle === "string" && parsed.destinationTitle.trim()
        ? parsed.destinationTitle.trim().slice(0, 80)
        : "戻れない記憶の場所";
    const destinationDescription =
      typeof parsed.destinationDescription === "string" && parsed.destinationDescription.trim()
        ? parsed.destinationDescription.trim().slice(0, 700)
        : "遠い記憶の中にだけ残っている、静かな帰る先。";
    const imagePrompt =
      typeof parsed.imagePrompt === "string" && parsed.imagePrompt.trim()
        ? parsed.imagePrompt.trim().slice(0, 1200)
        : "A cinematic dreamlike memory landscape in soft light, quiet nostalgic atmosphere, no text, no logos.";

    let imageUrl = "";
    let fallback = false;
    try {
      const imageResult = await geminiGenerateWithFallbacks({
        models: imageModelFallbacks,
        label: "image",
        apiVersion: "v1",
        body: {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${imagePrompt}
Style: dark nostalgic cinematic, ephemeral, quiet, emotional, like a remembered place glimpsed through time. No readable text, no watermark.`
                }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ["IMAGE"]
          }
        }
      });
      imageUrl = getGeminiImageUrl(imageResult.data);
      if (!imageUrl) {
        throw new Error("Image generation did not return an image.");
      }
    } catch (imageError) {
      console.warn("Gemini image generation failed; using fallback image:", imageError.message);
      imageUrl = makeFallbackMemory(reason, {
        saudadeScore,
        destinationTitle,
        destinationDescription,
        imagePrompt
      }).imageUrl;
      fallback = true;
    }

    res.json({
      saudadeScore,
      destinationTitle,
      destinationDescription,
      imagePrompt,
      imageUrl,
      fallback
    });
  } catch (error) {
    console.error("Saudade analysis failed:", error);
    res.json(makeFallbackMemory(reason));
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Saudade server listening on ${port}`);
});
