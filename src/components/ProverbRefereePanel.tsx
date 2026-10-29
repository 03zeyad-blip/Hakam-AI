import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  AIEventCard,
  GameRules,
  Language,
  Player,
  ProverbItem,
  VoiceMode,
} from '../types';
import {
  computeArabicSimilarity,
  computeReportHash,
  isFairPlayEligible,
  normalizeArabic,
  playSoundEffect,
  speakCommentary,
} from '../i18n';

interface ProverbRefereePanelProps {
  proverbs: ProverbItem[];
  players: Player[];
  currentPlayerIndex: number;
  teamAName: string;
  teamBName: string;
  rules: GameRules;
  lang: Language;
  voiceMode: VoiceMode;
  onApplyResults: (
    events: AIEventCard[],
    scoreDeltaA: number,
    scoreDeltaB: number,
    mvpName: string,
    mvpReasonEn: string,
    mvpReasonAr: string,
    reportHash: string
  ) => void;
  onToast: (msg: string) => void;
}

export const ProverbRefereePanel: React.FC<ProverbRefereePanelProps> = ({
  proverbs,
  players,
  currentPlayerIndex,
  teamAName,
  teamBName,
  rules,
  lang,
  voiceMode,
  onApplyResults,
  onToast,
}) => {
  const activePlayer = players[currentPlayerIndex % Math.max(1, players.length)] || players[0];
  const hasFairPlayHandicap = rules.fairPlayAgeHandicap && isFairPlayEligible(activePlayer?.age || 25);
  const maxTurnTime = rules.roundTimeSeconds + (hasFairPlayHandicap ? 5 : 0);

  const [proverbIdx, setProverbIdx] = useState<number>(0);
  const currentProverb = proverbs[proverbIdx % proverbs.length] || proverbs[0];

  const [spokenTranscript, setSpokenTranscript] = useState<string>('');
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [recognitionLang, setRecognitionLang] = useState<'ar-AE' | 'en-US'>('ar-AE');

  const [timerSec, setTimerSec] = useState<number>(maxTurnTime);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedAnswerSec, setElapsedAnswerSec] = useState<number>(3.2);

  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<'idle' | 'correct' | 'wrong' | 'stolen'>('idle');
  const [awardedPoints, setAwardedPoints] = useState<number>(0);
  const [canSteal, setCanSteal] = useState<boolean>(false);
  const [sessionEvents, setSessionEvents] = useState<AIEventCard[]>([]);
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiExplanation, setGeminiExplanation] = useState<string>('');

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setTimerSec(maxTurnTime);
    setTimerRunning(false);
  }, [proverbIdx, maxTurnTime]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerRunning(false);
          playSoundEffect('buzzer');
          setCanSteal(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const createProverbCardSnapshot = (
    proverbText: string,
    spoken: string,
    similarity: number,
    isOk: boolean
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#12262A';
    ctx.fillRect(0, 0, 320, 180);
    ctx.strokeStyle = isOk ? '#5CC4B9' : '#E4572E';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 304, 164);
    ctx.fillStyle = '#F2B33D';
    ctx.font = 'bold 14px "Tajawal", sans-serif';
    ctx.fillText(`المثل: ${proverbText} ...`, 20, 42);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '13px "Tajawal", sans-serif';
    ctx.fillText(`إجابة اللاعب: "${spoken}"`, 20, 82);
    ctx.fillStyle = isOk ? '#5CC4B9' : '#E4572E';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText(`MATCH: ${similarity}% (${isOk ? 'CORRECT ✔' : 'MISS ✖'})`, 20, 130);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleReadFirstHalfAloud = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${currentProverb.firstHalf} ... أكمل المثل`);
    u.lang = 'ar-AE';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
    setTimerSec(maxTurnTime);
    setTimerRunning(true);
    onToast(lang === 'ar' ? 'تمت قراءة الشطر الأول وبدأ المؤقت!' : 'First half read aloud & timer started!');
  };

  const evaluateSpokenAnswer = (rawText: string, altList: string[] = []) => {
    const candidates = [rawText, ...altList].filter(Boolean);
    let bestScore = 0;
    let bestCandidate = rawText;

    candidates.forEach((cand) => {
      const score = computeArabicSimilarity(
        cand,
        currentProverb.ending,
        `${currentProverb.firstHalf} ${currentProverb.ending}`
      );
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    });

    const timeUsed = Math.max(1.2, Number((maxTurnTime - timerSec || 2.8).toFixed(1)));
    setElapsedAnswerSec(timeUsed);
    setSpokenTranscript(bestCandidate);
    setMatchPct(bestScore);
    setTimerRunning(false);

    if (bestScore >= 60) {
      // 2 points if correct within 5s (or within 10s for fair-play handicap), 1 point if slower
      const fastLimit = hasFairPlayHandicap ? 10 : 5;
      const pts = timeUsed <= fastLimit ? 2 : 1;
      setVerdict('correct');
      setAwardedPoints(pts);
      setCanSteal(false);
      playSoundEffect('goal');

      const ev: AIEventCard = {
        id: `prov_ev_${Date.now()}`,
        timeSec: timeUsed,
        type: 'PROVERB_CORRECT',
        team: activePlayer.team,
        playerName: activePlayer.name,
        points: pts,
        reasonEn: `"${bestCandidate}" matched "${currentProverb.ending}" with ${bestScore}% Arabic normalized similarity (>=60%) in ${timeUsed}s → +${pts} pts!`,
        reasonAr: `الإجابة "${bestCandidate}" طابقت "${currentProverb.ending}" بنسبة ${bestScore}% (أعلى من 60%) خلال ${timeUsed} ثانية ← +${pts} نقاط!`,
        thumbnailDataUrl: createProverbCardSnapshot(currentProverb.firstHalf, bestCandidate, bestScore, true),
        verified: true,
      };
      setSessionEvents((prev) => [ev, ...prev]);

      speakCommentary(
        `Correct! ${activePlayer.name} earns ${pts} points with ${bestScore}% match!`,
        `إجابة صحيحة! ${activePlayer.name} يحصل على ${pts} نقاط بنسبة تطابق ${bestScore}%!`,
        voiceMode
      );
    } else {
      setVerdict('wrong');
      setAwardedPoints(0);
      setCanSteal(true);
      playSoundEffect('buzzer');
      speakCommentary(
        `Not quite! Only ${bestScore}% match. The other team can steal for 1 point!`,
        `إجابة غير مطابقة (${bestScore}%). يمكن للفريق الآخر سرقة النقطة الآن!`,
        voiceMode
      );
    }
  };

  const handleStartMicrophone = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      onToast(
        lang === 'ar'
          ? 'المتصفح لا يدعم Web Speech API مباشر — استخدم الأزرار الصوتية السريعة أو الحقل النصي بالأسفل'
          : 'Browser SpeechRecognition unavailable — use quick voice simulation or input box below'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = recognitionLang;
      rec.interimResults = false;
      rec.maxAlternatives = 5;

      rec.onstart = () => {
        setIsListening(true);
        if (!timerRunning) setTimerRunning(true);
      };

      rec.onresult = (event: any) => {
        const result = event.results[0];
        const alts: string[] = [];
        for (let i = 0; i < result.length; i++) {
          alts.push(result[i].transcript);
        }
        setAlternatives(alts);
        evaluateSpokenAnswer(alts[0] || '', alts);
      };

      rec.onerror = () => {
        setIsListening(false);
        onToast(lang === 'ar' ? 'تعذر التقاط الصوت — جرب الإدخال المباشر' : 'Mic capture interrupted — try direct input');
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleStealPoint = () => {
    const otherTeam = activePlayer.team === 'A' ? 'B' : 'A';
    const stealer = players.find((p) => p.team === otherTeam) || players[0];
    setVerdict('stolen');
    setAwardedPoints(1);
    setCanSteal(false);
    playSoundEffect('goal');

    const ev: AIEventCard = {
      id: `prov_steal_${Date.now()}`,
      timeSec: elapsedAnswerSec,
      type: 'PROVERB_STEAL',
      team: otherTeam,
      playerName: stealer.name,
      points: 1,
      reasonEn: `Steal successful! ${stealer.name} (Team ${otherTeam}) completed "${currentProverb.firstHalf} … ${currentProverb.ending}" for +1 steal point.`,
      reasonAr: `سرقة نقطة ناجحة! أكمل ${stealer.name} المثل "${currentProverb.firstHalf} … ${currentProverb.ending}" وحصل على +1 نقطة.`,
      thumbnailDataUrl: createProverbCardSnapshot(currentProverb.firstHalf, currentProverb.ending, 100, true),
      verified: true,
    };
    setSessionEvents((prev) => [ev, ...prev]);
    onToast(lang === 'ar' ? `سرق فريق ${otherTeam === 'A' ? teamAName : teamBName} النقطة!` : `Team ${otherTeam} stole +1 point!`);
  };

  const handleAskGeminiDialectJudge = async () => {
    if (!spokenTranscript.trim()) return;
    setGeminiLoading(true);
    try {
      const res = await fetch('/api/gemini/proverb-judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstHalf: currentProverb.firstHalf,
          expectedEnding: currentProverb.ending,
          meaningEn: currentProverb.meaningEn,
          spokenText: spokenTranscript,
        }),
      });
      const data = await res.json();
      setGeminiExplanation(lang === 'ar' ? data.explanationAr : data.explanationEn);
      if (data.isCorrect && verdict !== 'correct') {
        setMatchPct(data.matchPercent || 85);
        setVerdict('correct');
        setAwardedPoints(1);
        setCanSteal(false);
        const ev: AIEventCard = {
          id: `prov_gemini_${Date.now()}`,
          timeSec: elapsedAnswerSec,
          type: 'PROVERB_CORRECT',
          team: activePlayer.team,
          playerName: activePlayer.name,
          points: 1,
          reasonEn: `Gemini Dialect Judge approved "${spokenTranscript}" (${data.explanationEn}) → +1 pt.`,
          reasonAr: `حكم اللهجات Gemini اعتمد الإجابة "${spokenTranscript}" (${data.explanationAr}) ← +1 نقطة.`,
          thumbnailDataUrl: createProverbCardSnapshot(
            currentProverb.firstHalf,
            spokenTranscript,
            data.matchPercent || 85,
            true
          ),
          verified: true,
        };
        setSessionEvents((prev) => [ev, ...prev]);
      }
    } catch {
      onToast(lang === 'ar' ? 'تعذر الاتصال بحكم اللهجات Gemini' : 'Could not reach Gemini Dialect Judge');
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleFinalizeProverbSession = async () => {
    let scoreA = 0;
    let scoreB = 0;
    const playerPoints: Record<string, number> = {};
    sessionEvents.forEach((e) => {
      if (e.team === 'A') scoreA += e.points;
      if (e.team === 'B') scoreB += e.points;
      playerPoints[e.playerName] = (playerPoints[e.playerName] || 0) + e.points;
    });

    let mvpName = activePlayer.name;
    let bestPts = -1;
    Object.entries(playerPoints).forEach(([name, pts]) => {
      if (pts > bestPts) {
        bestPts = pts;
        mvpName = name;
      }
    });

    const mvpReasonEn = `${mvpName} led Proverb Relay with ${Math.max(1, bestPts)} points in Emirati & Arabic heritage proverbs.`;
    const mvpReasonAr = `تصدّر ${mvpName} تحدي الأمثال برصيد ${Math.max(1, bestPts)} نقاط في الأمثال الإماراتية والعربية.`;

    const hash = await computeReportHash({
      version: '2026.1-SPEECH-NLP',
      generator: 'Hakam-AI-Arabic-Normalizer',
      timestamp: new Date().toISOString(),
      gameType: 'proverb_relay',
      teamAName,
      teamBName,
      scoreDeltaA: scoreA,
      scoreDeltaB: scoreB,
      mvpName,
      mvpReasonEn,
      mvpReasonAr,
      events: sessionEvents,
    });

    onApplyResults(sessionEvents, scoreA, scoreB, mvpName, mvpReasonEn, mvpReasonAr, hash);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Cols: Proverb Relay Voice Studio */}
      <div className="lg:col-span-7 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#0B6A64] dark:text-[#5CC4B9]">
              {currentProverb.category} · #{proverbIdx + 1} / {proverbs.length}
            </span>
            <h3 className="text-lg font-bold text-[#12262A] dark:text-white mt-0.5">
              {lang === 'ar'
                ? `دور اللاعب: ${activePlayer.name} (${activePlayer.team === 'A' ? teamAName : teamBName})`
                : `Active Turn: ${activePlayer.name} (${activePlayer.team === 'A' ? teamAName : teamBName})`}
            </h3>
          </div>

          {/* Countdown Timer */}
          <div className="flex items-center gap-3">
            {hasFairPlayHandicap && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {lang === 'ar' ? '+5 ثوانٍ ميزة اللعب النظيف' : '+5s Fair-Play Handicap'}
              </span>
            )}
            <div className="px-4 py-2 rounded-lg bg-[#12262A] text-[#F2B33D] font-mono tabular-nums text-xl font-bold">
              00:{String(timerSec).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* Big Proverb Display Card */}
        <div className="p-6 rounded-xl bg-[#12262A] text-white space-y-4 text-center">
          <p className="text-xs text-[#5CC4B9] font-medium">
            {lang === 'ar'
              ? 'الشطر الأول من المثل — أكمل الشطر الثاني بصوتك:'
              : 'First half of the Emirati/Arabic proverb — speak the ending:'}
          </p>
          <div className="text-2xl sm:text-3xl font-bold text-[#F2B33D] tracking-wide" dir="rtl">
            « {currentProverb.firstHalf} … ؟؟؟ »
          </div>
          <p className="text-xs text-slate-300 italic">{currentProverb.meaningEn}</p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleReadFirstHalfAloud}
              className="px-4 py-2.5 rounded-lg bg-[#0B6A64] hover:bg-[#0e8079] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
              {lang === 'ar' ? 'اقرأ الشطر الأول صوتياً (TTS)' : 'Read First Half Aloud (TTS)'}
            </button>

            <button
              type="button"
              onClick={() => {
                setProverbIdx((prev) => (prev + 1) % proverbs.length);
                setVerdict('idle');
                setMatchPct(null);
                setSpokenTranscript('');
                setCanSteal(false);
              }}
              className="px-3.5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              {lang === 'ar' ? 'مثل آخر' : 'Next Proverb'}
            </button>
          </div>
        </div>

        {/* Microphone & Spoken Answer Controls */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartMicrophone}
                className={`px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer ${
                  isListening
                    ? 'bg-[#E4572E] text-white'
                    : 'bg-[#0B6A64] hover:bg-[#09534E] text-white'
                }`}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {isListening
                  ? lang === 'ar'
                    ? 'جاري الاستماع... تحدث الآن'
                    : 'Listening... Speak Now'
                  : lang === 'ar'
                  ? 'تحدث بالميكروفون (ar-AE)'
                  : 'Speak Answer (Microphone)'}
              </button>

              <select
                value={recognitionLang}
                onChange={(e) => setRecognitionLang(e.target.value as 'ar-AE' | 'en-US')}
                className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ar-AE">العربية (ar-AE)</option>
                <option value="en-US">English (en-US)</option>
              </select>
            </div>

            {/* Quick Voice Simulation Buttons for Demo / Projector Mode */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => evaluateSpokenAnswer(currentProverb.ending)}
                className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 cursor-pointer"
              >
                {lang === 'ar'
                  ? `تجربة نطق صحيح: "${currentProverb.ending}"`
                  : `Simulate Spoken: "${currentProverb.ending}"`}
              </button>
              <button
                type="button"
                onClick={() => evaluateSpokenAnswer('لا أعرف التكملة')}
                className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
              >
                {lang === 'ar' ? 'تجربة إجابة خاطئة (لتفعيل السرقة)' : 'Simulate Wrong (Trigger Steal)'}
              </button>
            </div>
          </div>

          {/* Manual / Transcript Input & Arabic Normalization Inspector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
              {lang === 'ar'
                ? 'النص الملتقط صوتياً (أو اكتب التكملة لاختبار التطبيع العربي):'
                : 'Live Speech Transcript (or type Arabic ending to test normalization):'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                dir="rtl"
                value={spokenTranscript}
                onChange={(e) => setSpokenTranscript(e.target.value)}
                placeholder={lang === 'ar' ? 'مثال: ما تصفق ...' : 'e.g., ما تصفق ...'}
                className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              />
              <button
                type="button"
                onClick={() => evaluateSpokenAnswer(spokenTranscript)}
                className="px-4 py-2 rounded-lg bg-[#12262A] text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                {lang === 'ar' ? 'تحكيم الإجابة' : 'Judge Answer'}
              </button>
              <button
                type="button"
                disabled={geminiLoading || !spokenTranscript}
                onClick={handleAskGeminiDialectJudge}
                className="px-3.5 py-2 rounded-lg bg-[#F2B33D] text-[#12262A] text-xs font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {lang === 'ar' ? 'حكم اللهجات Gemini' : 'Gemini Dialect Judge'}
              </button>
            </div>
          </div>

          {/* Normalization & Fuzzy Match Breakdown */}
          {matchPct !== null && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                <span>
                  {lang === 'ar' ? 'التطبيع العربي (أ/إ/آ→ا، ة→ه، ى→ي):' : 'Normalized Arabic Comparison:'}{' '}
                  <strong>"{normalizeArabic(spokenTranscript)}"</strong> vs{' '}
                  <strong>"{normalizeArabic(currentProverb.ending)}"</strong>
                </span>
                <span
                  className={`font-bold text-sm ${
                    matchPct >= 60 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {matchPct}% Match {matchPct >= 60 ? '✔ (>=60%)' : '✖ (<60%)'}
                </span>
              </div>

              {verdict === 'correct' && (
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {lang === 'ar'
                    ? `✔ إجابة صحيحة خلال ${elapsedAnswerSec} ثانية! حصل ${activePlayer.name} على +${awardedPoints} نقاط.`
                    : `✔ Correct within ${elapsedAnswerSec}s! ${activePlayer.name} earns +${awardedPoints} points.`}
                </div>
              )}

              {canSteal && (
                <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {lang === 'ar'
                      ? 'فرصة سرقة النقطة متاحة للفريق الآخر (+1 نقطة)!'
                      : 'Wrong answer! The other team can STEAL for +1 point!'}
                  </span>
                  <button
                    type="button"
                    onClick={handleStealPoint}
                    className="px-4 py-2 rounded-lg bg-[#E4572E] hover:bg-[#c9451e] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    {lang === 'ar' ? 'سرقة النقطة (+1)' : 'Steal for Other Team (+1 pt)'}
                  </button>
                </div>
              )}

              {geminiExplanation && (
                <p className="text-xs text-amber-800 dark:text-amber-300 pt-1">
                  <strong>Gemini:</strong> {geminiExplanation}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right 5 Cols: Recorded Proverb Events & Apply Button */}
      <div className="lg:col-span-5 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-base text-[#12262A] dark:text-white">
            {lang === 'ar' ? 'سجل قرارات حكم الأمثال' : 'Speech Referee Decisions'}
          </h4>
          <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200">
            {sessionEvents.length} {lang === 'ar' ? 'قرارات' : 'decisions'}
          </span>
        </div>

        {sessionEvents.length === 0 ? (
          <p className="text-xs text-slate-700 dark:text-slate-200 py-8 text-center">
            {lang === 'ar'
              ? 'أجب عن مثل واحد على الأقل لتسجيل قرارات الحكم الذكي.'
              : 'Complete at least one proverb above to record verified Speech Referee decisions.'}
          </p>
        ) : (
          <div className="space-y-3 max-h-[360px] overflow-y-auto">
            {sessionEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-3 items-start"
              >
                {ev.thumbnailDataUrl && (
                  <img
                    src={ev.thumbnailDataUrl}
                    alt={ev.type}
                    referrerPolicy="no-referrer"
                    className="w-24 h-14 object-cover rounded border border-slate-300 shrink-0"
                  />
                )}
                <div className="space-y-1 text-xs min-w-0 flex-1">
                  <div className="flex items-center justify-between font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    <span>{ev.type}</span>
                    <span className="font-bold text-[#0B6A64] dark:text-[#5CC4B9]">+{ev.points} pts</span>
                  </div>
                  <div className="font-bold text-[#12262A] dark:text-white">{ev.playerName}</div>
                  <p className="text-slate-600 dark:text-slate-300">
                    {lang === 'ar' ? ev.reasonAr : ev.reasonEn}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {sessionEvents.length > 0 && (
          <button
            type="button"
            onClick={handleFinalizeProverbSession}
            className="w-full py-3 px-4 rounded-lg bg-[#0B6A64] hover:bg-[#09534E] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            {lang === 'ar' ? 'اعتماد نتائج الأمثال والانتقال للنتائج' : 'Apply Speech Referee Results'}
          </button>
        )}
      </div>
    </div>
  );
};
