import React, { createContext, useContext, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Mic, Send, Sparkles, RotateCcw } from "lucide-react";
import setsunaTravelLogo from "./assets/setsuna-travel-logo.png";
import "./styles.css";

const RETURN_MAX_SECONDS = 7;
const MIN_VISIBLE_SECONDS = 1.2;

const initialMemory = {
  recognizedSpeech: "",
  reason: "",
  saudadeScore: 0,
  destinationTitle: "",
  destinationDescription: "",
  imagePrompt: "",
  generatedImageUrl: ""
};

const SaudadeContext = createContext(null);

function useSaudade() {
  return useContext(SaudadeContext);
}

function SaudadeProvider({ children }) {
  const [memory, setMemory] = useState(initialMemory);
  const reset = () => setMemory(initialMemory);
  const value = useMemo(() => ({ memory, setMemory, reset }), [memory]);
  return <SaudadeContext.Provider value={value}>{children}</SaudadeContext.Provider>;
}

function Shell({ children, className = "" }) {
  return (
    <main className={`app-shell ${className}`}>
      <div className="grain" />
      <div className="vignette" />
      {children}
    </main>
  );
}

function TitleScreen() {
  const navigate = useNavigate();
  return (
    <Shell className="title-screen">
      <section className="center-stack">
        <p className="small-kicker">帰りたい。でも、完全には帰れない。</p>
        <img className="title-logo" src={setsunaTravelLogo} alt="セツナトラベル" />
        <p className="subtitle">帰りたい場所は、ありますか。</p>
        <button className="primary-button" onClick={() => navigate("/question")}>
          帰りたい
        </button>
      </section>
    </Shell>
  );
}

function VoiceScreen() {
  const { memory, setMemory } = useSaudade();
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const [textFallback, setTextFallback] = useState("");
  const [godVisible, setGodVisible] = useState(false);
  const [error, setError] = useState("");
  const [recognitionPhase, setRecognitionPhase] = useState("idle");
  const recognitionRef = React.useRef(null);
  const shouldListenRef = React.useRef(false);
  const acceptedRef = React.useRef(false);
  const latestTranscriptRef = React.useRef("");
  const checkingRequestedRef = React.useRef(false);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supportsSpeech = Boolean(SpeechRecognition);

  const normalizeSpeech = (value) =>
    value
      .replace(/\s/g, "")
      .replace(/[\u30a1-\u30f6]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0x60)
      );

  const isReturnPhrase = (value) => {
    const normalized = normalizeSpeech(value);
    return [
      "帰",
      "かえ",
      "還",
      "返",
      "戻",
      "もど",
      "帰りたい",
      "かえりたい",
      "戻りたい",
      "もどりたい",
      "もう一度",
      "あの頃",
      "あのころ",
      "昔",
      "家に",
      "会いたい"
    ].some((phrase) => normalized.includes(normalizeSpeech(phrase)));
  };

  const hasRecognizedSpeech = (value) => {
    const normalized = normalizeSpeech(value).replace(/[、。，．,.!?！？「」『』（）()ー\-]/g, "");
    return normalized.length > 0;
  };

  const showGodAndContinue = () => {
    acceptedRef.current = true;
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setError("");
    setRecognitionPhase("done");
    setGodVisible(true);
    setTimeout(() => navigate("/question"), 2100);
  };

  const acceptSpeech = (value) => {
    const clean = value.trim();
    setMemory((prev) => ({ ...prev, recognizedSpeech: clean }));
    if (!isReturnPhrase(clean) && !hasRecognizedSpeech(clean)) {
      return;
    }
    showGodAndContinue();
  };

  const finishListening = () => {
    checkingRequestedRef.current = true;
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setRecognitionPhase("checking");
    setTimeout(() => {
      if (acceptedRef.current) return;
      const transcript = latestTranscriptRef.current.trim();
      if (hasRecognizedSpeech(transcript)) {
        acceptSpeech(transcript);
      } else {
        setRecognitionPhase("failed");
        setError("まだ声が入っていないようです。もう一度押して話すか、下のボタンで進めます。");
      }
    }, 360);
  };

  const startListening = () => {
    if (!supportsSpeech) return;
    if (listening) {
      finishListening();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    acceptedRef.current = false;
    checkingRequestedRef.current = false;
    latestTranscriptRef.current = "";
    setListening(true);
    setRecognitionPhase("listening");
    setError("");

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      latestTranscriptRef.current = transcript;
      setMemory((prev) => ({ ...prev, recognizedSpeech: transcript }));
    };
    recognition.onerror = (event) => {
      if (!acceptedRef.current) {
        if (checkingRequestedRef.current) {
          setRecognitionPhase("failed");
          setError("声をうまく聞き取れませんでした。もう一度、または下のボタンで進めます。");
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldListenRef.current = false;
          setListening(false);
          setRecognitionPhase("failed");
          setError("マイクの許可が必要です。許可するか、下のボタンで進めます。");
          return;
        }
        setRecognitionPhase("listening");
        setError("");
      }
    };
    recognition.onend = () => {
      if (shouldListenRef.current && !acceptedRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
          setRecognitionPhase(checkingRequestedRef.current ? "failed" : "idle");
        }
        return;
      }
      setListening(false);
    };
    recognition.start();
  };

  React.useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <Shell className={godVisible ? "summoning" : ""}>
      <section className="center-stack voice-stage">
        <p className="screen-copy">「帰りたい」と声に出してください。</p>
        {supportsSpeech ? (
          <button
            className={`mic-button ${listening ? "listening" : ""}`}
            onClick={startListening}
            aria-label={listening ? "音声認識を停止" : "音声認識を開始"}
          >
            <Mic size={38} />
          </button>
        ) : (
          <form
            className="fallback-form"
            onSubmit={(event) => {
              event.preventDefault();
              acceptSpeech(textFallback);
            }}
          >
            <input
              value={textFallback}
              onChange={(event) => setTextFallback(event.target.value)}
              placeholder="帰りたい"
            />
            <button className="icon-button" aria-label="送信">
              <Send size={19} />
            </button>
          </form>
        )}
        {listening && <div className="listening-ring" />}
        <p className={`listen-status status-${recognitionPhase}`}>
          {recognitionPhase === "listening" && "認識中です。話し終えたら、もう一度マイクを押してください。"}
          {recognitionPhase === "checking" && "認識結果を確認しています……"}
          {recognitionPhase === "failed" && "認識終了。声が入らなかったようです。"}
          {recognitionPhase === "done" && "認識できました。"}
          {recognitionPhase === "idle" && "マイクを押すと認識を始めます。"}
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            setMemory((prev) => ({
              ...prev,
              recognizedSpeech: prev.recognizedSpeech || "帰りたい"
            }));
            showGodAndContinue();
          }}
        >
          うまく認識できないので進む
        </button>
        <p className="transcript">{memory.recognizedSpeech || " "}</p>
        {error && <p className="error-text">{error}</p>}
      </section>
      {godVisible && <AbstractGod />}
    </Shell>
  );
}

function AbstractGod() {
  return (
    <div className="god-presence" aria-hidden="true">
      <div className="god-core" />
      <div className="god-halo" />
      <Sparkles className="god-spark" size={42} />
    </div>
  );
}

function QuestionScreen() {
  const { memory, setMemory } = useSaudade();
  const navigate = useNavigate();
  const [localReason, setLocalReason] = useState(memory.reason);
  const exampleReasonLong = `もう亡くなった祖父と、子どもの頃の夏休みに戻りたい。
夕方のグラウンドで一緒にサッカーをして、帰り道に祖父の車の助手席で黙って夕焼けを見て、家に着いたら同じ食卓でご飯を食べたい。
あの時は当たり前だと思っていた声や匂いや時間が、もう二度と戻らないものだったと今になって分かった。
一度だけでいいから、あの何でもない一日に帰りたい。`;

  const submit = (event) => {
    event.preventDefault();
    if (localReason.trim().length < 4) return;
    setMemory((prev) => ({ ...prev, reason: localReason.trim() }));
    navigate("/analysis");
  };

  return (
    <Shell>
      <section className="question-layout">
        <AbstractGod />
        <h2>なぜ、帰りたい？</h2>
        <form onSubmit={submit} className="reason-form">
          <div className="example-actions" aria-label="例文を入力">
            <button type="button" className="secondary-button" onClick={() => setLocalReason(exampleReasonLong)}>
              例文1
            </button>
            <button type="button" className="secondary-button" onClick={() => setLocalReason("帰りたい。")}>
              例文2
            </button>
          </div>
          <textarea
            value={localReason}
            onChange={(event) => setLocalReason(event.target.value)}
            placeholder="もう会えない祖父と、もう一度あの縁側で話したい。"
          />
          <button className="primary-button" disabled={localReason.trim().length < 4}>
            神様に伝える
          </button>
        </form>
      </section>
    </Shell>
  );
}

function AnalysisScreen() {
  const { memory, setMemory } = useSaudade();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!memory.generatedImageUrl);
  const [error, setError] = useState("");
  const [animatedScore, setAnimatedScore] = useState(0);

  React.useEffect(() => {
    if (!memory.reason) {
      navigate("/question");
      return;
    }
    if (memory.generatedImageUrl) return;

    const analyze = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/analyze-saudade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: memory.reason })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setMemory((prev) => ({
          ...prev,
          saudadeScore: data.saudadeScore,
          destinationTitle: data.destinationTitle,
          destinationDescription: data.destinationDescription,
          imagePrompt: data.imagePrompt,
          generatedImageUrl: data.imageUrl
        }));
      } catch (err) {
        setError(err.message || "記憶をうまく読み取れませんでした。もう一度伝えてください。");
      } finally {
        setLoading(false);
      }
    };

    analyze();
  }, [memory.reason]);

  React.useEffect(() => {
    const target = memory.saudadeScore;
    let frame;
    let start;
    const animate = (time) => {
      if (!start) start = time;
      const progress = Math.min((time - start) / 1800, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [memory.saudadeScore]);

  return (
    <Shell className="analysis-screen">
      {memory.generatedImageUrl && (
        <img className="hidden-memory-image" src={memory.generatedImageUrl} alt="" />
      )}
      <section className="analysis-content">
        {loading ? (
          <div className="loading-memory">
            <div className="slow-orbit" />
            <p>あなたの記憶を読み取っています……</p>
          </div>
        ) : error ? (
          <div className="error-panel">
            <p>{error}</p>
            <button className="primary-button" onClick={() => navigate("/question")}>
              もう一度伝える
            </button>
          </div>
        ) : (
          <>
            <p className="small-kicker">Saudade 解析</p>
            <h2>{memory.destinationTitle}</h2>
            <SaudadeGauge score={animatedScore} />
            <p className="description">{memory.destinationDescription}</p>
            <button className="primary-button" onClick={() => navigate("/return")}>
              ゲージを解放する
            </button>
          </>
        )}
      </section>
    </Shell>
  );
}

function SaudadeGauge({ score }) {
  const capped = Math.min(score, 100);
  const overflow = Math.max(score - 100, 0);
  const isBreaking = score > 100;
  return (
    <div className={`gauge-wrap ${isBreaking ? "breaking" : ""}`}>
      <div className="score-text">切なさ {score} / 120</div>
      <div className="gauge-frame">
        <div className="gauge-fill" style={{ width: `${capped}%` }} />
        {overflow > 0 && <div className="gauge-overflow" style={{ width: `${overflow * 2.6}%` }} />}
        <div className="crack crack-a" />
        <div className="crack crack-b" />
      </div>
    </div>
  );
}

function ReturnScreen() {
  const { memory } = useSaudade();
  const navigate = useNavigate();
  const duration = Math.max(
    memory.saudadeScore === 0 ? 0 : MIN_VISIBLE_SECONDS,
    (memory.saudadeScore / 120) * RETURN_MAX_SECONDS
  );
  const [phase, setPhase] = useState("charge");
  const [darkness, setDarkness] = useState(0);

  React.useEffect(() => {
    if (!memory.generatedImageUrl) {
      navigate("/analysis");
      return;
    }

    const chargeTimer = setTimeout(() => setPhase("visible"), 1500);
    return () => clearTimeout(chargeTimer);
  }, []);

  React.useEffect(() => {
    if (phase !== "visible") return undefined;
    const audio = createTickAudio();
    let timeoutId;
    let frameId;
    const startedAt = performance.now();
    const total = Math.max(duration, 0.1) * 1000;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(elapsed / total, 1);
      audio.tick(progress);
      const urgency = Math.pow(progress, 2.35);
      const nextGap = 980 - urgency * 860;
      timeoutId = setTimeout(tick, Math.max(58, nextGap));
    };

    const fade = (time) => {
      const progress = Math.min((time - startedAt) / total, 1);
      setDarkness(Math.pow(progress, 2.8));
      if (progress < 1) {
        frameId = requestAnimationFrame(fade);
      } else {
        audio.close();
        setTimeout(() => navigate("/cannot-return"), 1300);
      }
    };

    tick();
    frameId = requestAnimationFrame(fade);
    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(frameId);
      audio.close();
    };
  }, [phase]);

  return (
    <Shell className={`return-screen phase-${phase}`}>
      {phase === "charge" && (
        <div className="release-charge">
          <SaudadeGauge score={memory.saudadeScore} />
          <div className="fracture-lines" />
        </div>
      )}
      {phase === "visible" && (
        <>
          <img className="memory-full" src={memory.generatedImageUrl} alt={memory.destinationTitle} />
          <p className="memory-title">{memory.destinationTitle}</p>
          <div className="darkness" style={{ opacity: darkness }} />
        </>
      )}
    </Shell>
  );
}

function createTickAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return { tick: () => {}, close: () => {} };
  const ctx = new AudioContext();
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  master.gain.value = 0.34;
  compressor.threshold.value = -26;
  compressor.knee.value = 16;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.045;
  master.connect(compressor).connect(ctx.destination);

  const makeClickBuffer = (seconds, density = 1) => {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const fade = Math.pow(1 - index / data.length, 4.5);
      const sparse = Math.random() < density ? 1 : 0;
      data[index] = (Math.random() * 2 - 1) * fade * sparse;
    }
    return buffer;
  };

  const hardClick = makeClickBuffer(0.032, 0.72);
  const contactClick = makeClickBuffer(0.024, 0.58);

  return {
    tick: (progress = 0) => {
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const accent = 0.86 + Math.pow(progress, 1.4) * 0.18;

      const playImpulse = ({ buffer, startAt, peak, highpass, bandpass, q, decay }) => {
        const source = ctx.createBufferSource();
        const hp = ctx.createBiquadFilter();
        const bp = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        hp.type = "highpass";
        hp.frequency.value = highpass;
        hp.Q.value = 0.5;
        bp.type = "bandpass";
        bp.frequency.value = bandpass;
        bp.Q.value = q;

        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak * accent, startAt + 0.0018);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);

        source.connect(hp).connect(bp).connect(gain).connect(master);
        source.start(startAt);
        source.stop(startAt + decay + 0.01);
      };

      playImpulse({
        buffer: hardClick,
        startAt: now,
        peak: 0.22,
        highpass: 900,
        bandpass: 1850,
        q: 2.8,
        decay: 0.026
      });
      playImpulse({
        buffer: contactClick,
        startAt: now + 0.006,
        peak: 0.12,
        highpass: 650,
        bandpass: 1250,
        q: 2.1,
        decay: 0.021
      });
    },
    close: () => {
      if (ctx.state !== "closed") ctx.close();
    }
  };
}

function CannotReturnScreen() {
  const { reset } = useSaudade();
  const navigate = useNavigate();
  const restart = () => {
    reset();
    navigate("/");
  };
  return (
    <Shell className="final-screen">
      <section className="final-words">
        <p className="line line-1">……</p>
        <p className="line line-2">帰れましたか？</p>
        <p className="line line-3">でも、</p>
        <h2 className="line line-4">完全には、戻れない。</h2>
        <p className="line line-5">それでも帰りたいと思うことを、Saudadeと呼ぶのかもしれない。</p>
        <button className="primary-button line line-6" onClick={restart}>
          <RotateCcw size={18} />
          もう一度
        </button>
      </section>
    </Shell>
  );
}

function App() {
  return (
    <SaudadeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TitleScreen />} />
          <Route path="/voice" element={<VoiceScreen />} />
          <Route path="/question" element={<QuestionScreen />} />
          <Route path="/analysis" element={<AnalysisScreen />} />
          <Route path="/return" element={<ReturnScreen />} />
          <Route path="/cannot-return" element={<CannotReturnScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SaudadeProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
