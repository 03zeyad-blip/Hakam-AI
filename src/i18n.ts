import { AIEventCard, GameRules, GameType, Player, ProverbItem, SignedAIReport, VoiceMode } from './types';

export const DEFAULT_PLAYERS: Player[] = [
  {
    id: 'p1',
    name: 'Dad (أب)',
    age: 44,
    team: 'A',
    colour: '#E4572E',
    avatar: '👨🏽',
    badges: ['Fair-Play Star'],
    ready: true,
  },
  {
    id: 'p2',
    name: 'Sara (سارة)',
    age: 9,
    team: 'A',
    colour: '#F2B33D',
    avatar: '👧🏽',
    badges: ['Golden Boot', 'Fastest Falcon'],
    ready: true,
  },
  {
    id: 'p3',
    name: 'Mum (أم)',
    age: 41,
    team: 'B',
    colour: '#2F6FD6',
    avatar: '👩🏽',
    badges: ['Proverb Master'],
    ready: true,
  },
  {
    id: 'p4',
    name: 'Omar (عمر)',
    age: 13,
    team: 'B',
    colour: '#5CC4B9',
    avatar: '👦🏽',
    badges: ['Fastest Falcon'],
    ready: true,
  },
];

export const DEFAULT_RULES: Record<GameType, GameRules> = {
  football: {
    gameType: 'football',
    pointsPerWinOrGoal: 1,
    roundTimeSeconds: 90,
    totalRounds: 2,
    penaltyValue: 1,
    tieBreakRuleEn: 'Team with higher total ball possession (%) wins the tie-break.',
    tieBreakRuleAr: 'الفريق الأكثر استحواذاً على الكرة (%) يفوز عند التعادل.',
    mvpRuleEn: 'Player who held ball possession for the longest total time (seconds).',
    mvpRuleAr: 'اللاعب الذي استحوذ على الكرة لأطول فترة زمنية (بالثواني).',
    fairPlayAgeHandicap: true,
  },
  camel_race: {
    gameType: 'camel_race',
    pointsPerWinOrGoal: 3,
    roundTimeSeconds: 30,
    totalRounds: 3,
    penaltyValue: 1.0,
    tieBreakRuleEn: 'Runner with the fastest single photo-finish time (0.01s precision) wins.',
    tieBreakRuleAr: 'المتسابق صاحب أسرع زمن فردي عند خط النهاية (بدقة 0.01 ثانية) يفوز.',
    mvpRuleEn: 'Fastest overall sprinter across heats after fair-play age adjustments.',
    mvpRuleAr: 'أسرع متسابق في الأشواط بعد احتساب ميزة اللعب النظيف للعمر.',
    fairPlayAgeHandicap: true,
  },
  proverb_relay: {
    gameType: 'proverb_relay',
    pointsPerWinOrGoal: 2,
    roundTimeSeconds: 10,
    totalRounds: 4,
    penaltyValue: 1,
    tieBreakRuleEn: 'Team with highest average Arabic similarity match (%) wins.',
    tieBreakRuleAr: 'الفريق صاحب أعلى نسبة تطابق لفظي في الأمثال يفوز.',
    mvpRuleEn: 'Player with the most fast (<=5s) accurate proverb completions.',
    mvpRuleAr: 'اللاعب صاحب أكبر عدد من الإجابات الصحيحة السريعة (أقل من 5 ثوانٍ).',
    fairPlayAgeHandicap: true,
  },
};

export const DEFAULT_PROVERBS: ProverbItem[] = [
  {
    id: 'prov_1',
    firstHalf: 'يد وحدة',
    ending: 'ما تصفق',
    meaningEn: 'One hand alone cannot clap — family teamwork achieves everything.',
    category: 'Cooperation · التعاون',
  },
  {
    id: 'prov_2',
    firstHalf: 'الجار قبل',
    ending: 'الدار',
    meaningEn: 'Choose the neighbour before the house — community and kindness come first.',
    category: 'Heritage · التراث',
  },
  {
    id: 'prov_3',
    firstHalf: 'من صبر',
    ending: 'ظفر',
    meaningEn: 'Whoever is patient achieves victory.',
    category: 'Patience · الصبر',
  },
  {
    id: 'prov_4',
    firstHalf: 'الصديق وقت',
    ending: 'الضيق',
    meaningEn: 'A true friend is known in times of need.',
    category: 'Loyalty · الوفاء',
  },
  {
    id: 'prov_5',
    firstHalf: 'اللي ما يعرف الصقر',
    ending: 'يشويه',
    meaningEn: 'He who does not know the falcon roasts it — value wisdom and heritage.',
    category: 'Emirati · إماراتي',
  },
  {
    id: 'prov_6',
    firstHalf: 'من جد',
    ending: 'وجد',
    meaningEn: 'Whoever strives diligently shall find success.',
    category: 'Diligence · الاجتهاد',
  },
  {
    id: 'prov_7',
    firstHalf: 'العلم في الصغر',
    ending: 'كالنقش في الحجر',
    meaningEn: 'Learning in youth is like engraving in stone.',
    category: 'Wisdom · الحكمة',
  },
  {
    id: 'prov_8',
    firstHalf: 'اللي يبغي الدح',
    ending: 'ما يقول أح',
    meaningEn: 'Whoever wants the reward does not complain of the effort (Emirati proverb).',
    category: 'Emirati · إماراتي',
  },
  {
    id: 'prov_9',
    firstHalf: 'سمك في',
    ending: 'الماي',
    meaningEn: 'Like fish in water — don’t bargain over something unseen.',
    category: 'Emirati · إماراتي',
  },
  {
    id: 'prov_10',
    firstHalf: 'الطول طول نخلة',
    ending: 'والعقل عقل صخلة',
    meaningEn: 'Tall as a palm tree, mind of a young goat — appearances do not equal wisdom.',
    category: 'Emirati · إماراتي',
  },
  {
    id: 'prov_11',
    firstHalf: 'ردت حليمة',
    ending: 'لعادتها القديمة',
    meaningEn: 'Halima returned to her old habits.',
    category: 'Heritage · التراث',
  },
  {
    id: 'prov_12',
    firstHalf: 'إذا هبت رياحك',
    ending: 'فاغتنمها',
    meaningEn: 'When your favourable winds blow, seize the opportunity.',
    category: 'Wisdom · الحكمة',
  },
  {
    id: 'prov_13',
    firstHalf: 'خير الكلام',
    ending: 'ما قل ودل',
    meaningEn: 'The best speech is concise and clear.',
    category: 'Eloquence · البلاغة',
  },
  {
    id: 'prov_14',
    firstHalf: 'الوقت كالسيف إن لم تقطعه',
    ending: 'قطعك',
    meaningEn: 'Time is like a sword; if you do not cut it, it cuts you.',
    category: 'Time · الوقت',
  },
  {
    id: 'prov_15',
    firstHalf: 'حلاة الثوب',
    ending: 'رقعته منه وفيه',
    meaningEn: 'A garment looks best when patched with its own fabric — family unity.',
    category: 'Emirati · إماراتي',
  },
  {
    id: 'prov_16',
    firstHalf: 'من سار على الدرب',
    ending: 'وصل',
    meaningEn: 'Whoever walks steadily on the path reaches the destination.',
    category: 'Perseverance · المثابرة',
  },
];

/**
 * Normalizes Arabic text according to competition rules:
 * - Removes tashkeel/diacritics and tatweel
 * - Unifies أ/إ/آ -> ا
 * - Unifies ة -> ه
 * - Unifies ى -> ي
 * - Strips punctuation and extra spaces
 */
export function normalizeArabic(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Remove diacritics & tatweel
    .replace(/[أإآٱ]/g, 'ا') // Unify Alef variants
    .replace(/ة/g, 'ه') // Unify Teh Marbuta -> Heh
    .replace(/ى/g, 'ي') // Unify Alef Maksura -> Yeh
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function computeArabicSimilarity(spoken: string, expectedEnding: string, fullProverb?: string): number {
  const normSpoken = normalizeArabic(spoken);
  const normEnding = normalizeArabic(expectedEnding);
  if (!normSpoken || !normEnding) return 0;

  const maxLen1 = Math.max(normSpoken.length, normEnding.length);
  const dist1 = levenshteinDistance(normSpoken, normEnding);
  const simEnding = Math.round(((maxLen1 - dist1) / maxLen1) * 100);

  // Also check if the player spoke the full proverb including the ending
  let simFull = 0;
  if (fullProverb) {
    const normFull = normalizeArabic(fullProverb);
    const maxLen2 = Math.max(normSpoken.length, normFull.length);
    const dist2 = levenshteinDistance(normSpoken, normFull);
    simFull = Math.round(((maxLen2 - dist2) / maxLen2) * 100);
  }

  // Check substring containment bonus if the ending words are inside the spoken phrase
  const containsEnding = normSpoken.includes(normEnding) ? 95 : 0;

  return Math.max(0, Math.min(100, Math.max(simEnding, simFull, containsEnding)));
}

/**
 * Computes a tamper-proof SHA-256 signature over the canonical AI report payload.
 */
export async function computeReportHash(payload: Omit<SignedAIReport, 'sha256Signature'>): Promise<string> {
  const canonical = JSON.stringify({
    version: payload.version,
    generator: payload.generator,
    gameType: payload.gameType,
    teamAName: payload.teamAName,
    teamBName: payload.teamBName,
    scoreDeltaA: payload.scoreDeltaA,
    scoreDeltaB: payload.scoreDeltaB,
    mvpName: payload.mvpName,
    events: payload.events.map((e) => ({
      timeSec: Number(e.timeSec.toFixed(2)),
      type: e.type,
      team: e.team,
      playerName: e.playerName,
      points: e.points,
    })),
  });
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical + '::HAKAM_UAE_FAMILY_2026_HMAC_KEY');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySignedReport(report: SignedAIReport): Promise<boolean> {
  if (!report || !report.sha256Signature || !Array.isArray(report.events)) return false;
  const expected = await computeReportHash(report);
  return expected === report.sha256Signature;
}

/**
 * Synthesized Web Audio sound effects (whistle, goal fanfare, time-up buzzer)
 */
export function playSoundEffect(type: 'whistle' | 'goal' | 'buzzer' | 'ready') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    if (type === 'whistle') {
      // Crisp referee start whistle burst (>= 13 dB peak)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2950, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(2800, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.45, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.46);
    } else if (type === 'goal') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
        gain.gain.setValueAtTime(0.28, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.008, ctx.currentTime + idx * 0.1 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 0.36);
      });
    } else if (type === 'buzzer') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(165, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.66);
    } else if (type === 'ready') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.19);
    }
  } catch {
    // Ignore audio context autoplay errors
  }
}

export function speakCommentary(textEn: string, textAr: string, voiceMode: VoiceMode) {
  if (voiceMode === 'off' || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voiceMode === 'ar' ? textAr : textEn);
    utterance.lang = voiceMode === 'ar' ? 'ar-AE' : 'en-US';
    utterance.rate = 1.02;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis errors
  }
}

export function isFairPlayEligible(age: number): boolean {
  return age < 10 || age >= 60;
}

export function getFairPlayLabel(age: number, lang: 'en' | 'ar'): string | null {
  if (age < 10) {
    return lang === 'ar' ? 'ميزة اللعب النظيف (أقل من 10 سنوات)' : 'Fair-Play Youth Boost (<10 yrs)';
  }
  if (age >= 60) {
    return lang === 'ar' ? 'ميزة اللعب النظيف لكبارنا (60+ سنة)' : 'Fair-Play Senior Honour (60+ yrs)';
  }
  return null;
}

export const TRANSLATIONS = {
  en: {
    appName: 'Hakam AI',
    appArabicName: 'حَكَم',
    tagline: 'The Fair AI Referee for Family Game Day · UAE Year of Family 2026',
    navDashboard: 'Dashboard',
    navGameFlow: 'Game Arena',
    navLeaderboard: 'Leaderboard',
    navGuide: 'How to Use',
    navSettings: 'Settings & Admin',
    startGameDay: 'Start Game Day',
    signInGoogle: 'Sign in with Google',
    guestMode: 'Guest Mode',
    signOut: 'Sign Out',
    step1: '1. Choose a Game',
    step2: '2. Players & Teams',
    step3: '3. Rules & Ready',
    step4: '4. Round in Play',
    step5: '5. AI Judge Results',
    step6: '6. Final Results',
    footballTitle: 'Football (كرة القدم)',
    footballSub: 'Team Game · AI Senses: Video Computer Vision',
    footballDesc:
      'AI tracks every player shirt and the ball in HSV colour space, detects goals in Goal A/B zones, identifies the scorer, and measures possession to the second.',
    camelTitle: 'Camel Race Sprint (سباق الهجن)',
    camelSub: 'Individual Game · AI Senses: Video + Web Audio',
    camelDesc:
      'Inspired by UAE Al Marmoom heritage. AI hears the start whistle (>=13 dB), catches false starts (+1.0s penalty), and times each runner’s torso photo-finish to 0.01s.',
    proverbTitle: 'Proverb Relay (أكمل المثل)',
    proverbSub: 'Team Game · AI Senses: Voice & Arabic NLP',
    proverbDesc:
      'Hakam AI reads the first half of an Emirati/Arabic proverb aloud. Players speak the ending; AI normalizes Arabic letters and scores fuzzy matches >= 60%.',
    fairPlayBanner:
      'Fair-Play Age Handicap Active: Kids under 10 and seniors 60+ get double football goals (2 pts), -1.0s / -1.5s off sprint times, and +5s proverb thinking time.',
    everyoneReady: 'Everyone is ready! Let the family match begin.',
    applyAiResults: 'Apply Verified AI Results',
    rematch: 'Play Rematch',
    chooseAnotherGame: 'Choose Another Game',
  },
  ar: {
    appName: 'حَكَم AI',
    appArabicName: 'حَكَم',
    tagline: 'الحكم الذكي العادل ليوم الألعاب العائلي · عام الأسرة الإماراتي 2026',
    navDashboard: 'لوحة العائلة',
    navGameFlow: 'ساحة اللعب',
    navLeaderboard: 'الترتيب والكؤوس',
    navGuide: 'طريقة الاستخدام',
    navSettings: 'الإعدادات والإدارة',
    startGameDay: 'ابدأ يوم الألعاب',
    signInGoogle: 'الدخول بحساب Google',
    guestMode: 'وضع الضيف',
    signOut: 'تسجيل الخروج',
    step1: '١. اختر اللعبة',
    step2: '٢. اللاعبون والفرق',
    step3: '٣. القوانين والاستعداد',
    step4: '٤. الجولة الجارية',
    step5: '٥. قرارات الحكم الذكي',
    step6: '٦. النتائج النهائية',
    footballTitle: 'كرة القدم (Football)',
    footballSub: 'لعبة جماعية · الحواس الذكية: تحليل الفيديو (Vision)',
    footballDesc:
      'يتابع الذكاء الاصطناعي قمصان اللاعبين والكرة، ويكتشف الأهداف واللاعب المسجل والأهداف العكسية، ويحسب نسبة الاستحواذ بالثواني.',
    camelTitle: 'سباق الهجن السريع (Camel Sprint)',
    camelSub: 'لعبة فردية · الحواس الذكية: الفيديو + الصوت',
    camelDesc:
      'مستوحاة من تراث سباقات الهجن الإماراتية. يسمع الحكم صافرة البداية، ويرصد الانطلاقات الخاطئة (+1 ثانية)، ويحسب زمن خط النهاية بدقة 0.01 ثانية.',
    proverbTitle: 'أكمل المثل (Proverb Relay)',
    proverbSub: 'لعبة جماعية · الحواس الذكية: التعرف الصوتي',
    proverbDesc:
      'يقرأ التطبيق الشطر الأول من المثل الإماراتي/العربي، ويكمل اللاعب الشطر الثاني صوتياً مع مطابقة ذكية تتجاوز 60% وخيار سرقة النقطة.',
    fairPlayBanner:
      'ميزة اللعب النظيف للعمر مفعّلة: الأطفال تحت 10 سنوات وكبار السن 60+ يحصلون على ضعف نقاط الهدف، وخصم 1.0 / 1.5 ثانية في السباق، و+5 ثوانٍ في الأمثال.',
    everyoneReady: 'جميع أفراد العائلة جاهزون! لنبدأ التحدي.',
    applyAiResults: 'اعتماد نتائج الحكم الذكي الموثقة',
    rematch: 'مباراة إعادة',
    chooseAnotherGame: 'اختر لعبة أخرى',
  },
};
