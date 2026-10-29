import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Cpu,
  Crown,
  Download,
  Eye,
  Flame,
  Globe,
  HelpCircle,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  logOutFirebase,
  OperationType,
  signInWithGoogle,
} from './firebase';
import {
  AIEventCard,
  CoachTip,
  GameRules,
  GameType,
  Language,
  LeaderboardRow,
  Player,
  ProverbItem,
  SavedGameRecord,
  TeamId,
  VoiceMode,
} from './types';
import {
  DEFAULT_PLAYERS,
  DEFAULT_PROVERBS,
  DEFAULT_RULES,
  getFairPlayLabel,
  isFairPlayEligible,
  playSoundEffect,
  speakCommentary,
  TRANSLATIONS,
} from './i18n';
import { VisionRefereePanel } from './components/VisionRefereePanel';
import { ProverbRefereePanel } from './components/ProverbRefereePanel';

const GAME_IMAGES: Record<GameType, string> = {
  football: '/src/assets/images/football_family_match_1793276763243.jpg',
  camel_race: '/src/assets/images/camel_race_sprint_heritage_1793276763818.jpg',
  proverb_relay: '/src/assets/images/proverb_relay_majlis_1793276765522.jpg',
};

const INITIAL_LEADERBOARD: LeaderboardRow[] = [
  {
    playerId: 'p2',
    playerName: 'Sara (سارة)',
    team: 'A',
    points: 18,
    wins: 4,
    goals: 6,
    bestRaceTime: 5.42,
    correctAnswers: 5,
    fairPlayBonusCount: 4,
  },
  {
    playerId: 'p4',
    playerName: 'Omar (عمر)',
    team: 'B',
    points: 15,
    wins: 3,
    goals: 4,
    bestRaceTime: 5.58,
    correctAnswers: 6,
    fairPlayBonusCount: 0,
  },
  {
    playerId: 'p1',
    playerName: 'Dad (أب)',
    team: 'A',
    points: 12,
    wins: 4,
    goals: 3,
    bestRaceTime: 6.12,
    correctAnswers: 4,
    fairPlayBonusCount: 0,
  },
  {
    playerId: 'p3',
    playerName: 'Mum (أم)',
    team: 'B',
    points: 14,
    wins: 3,
    goals: 2,
    bestRaceTime: 5.95,
    correctAnswers: 8,
    fairPlayBonusCount: 0,
  },
];

type MainTab = 'dashboard' | 'arena' | 'leaderboard' | 'guide' | 'settings';

export default function App() {
  // Auth & Family Profile State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [familyName, setFamilyName] = useState<string>('Al-Nuaimi Family · عائلة النعيمي');
  const [lang, setLang] = useState<Language>('en');
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [demoMode, setDemoMode] = useState<boolean>(false);

  // Navigation & 6-Step Game Flow
  const [activeTab, setActiveTab] = useState<MainTab>('arena');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [selectedGame, setSelectedGame] = useState<GameType>('football');

  // Teams & Players
  const [teamAName, setTeamAName] = useState<string>('Falcons');
  const [teamBName, setTeamBName] = useState<string>('Oryx');
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerAge, setNewPlayerAge] = useState<number>(11);
  const [newPlayerTeam, setNewPlayerTeam] = useState<TeamId>('A');
  const [newPlayerColour, setNewPlayerColour] = useState<string>('#10B981');

  // Rules & Round in Play
  const [rulesMap, setRulesMap] = useState<Record<GameType, GameRules>>(DEFAULT_RULES);
  const currentRules = rulesMap[selectedGame];

  const [currentRound, setCurrentRound] = useState<number>(1);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [roundTimerSec, setRoundTimerSec] = useState<number>(DEFAULT_RULES.football.roundTimeSeconds);
  const [roundTimerRunning, setRoundTimerRunning] = useState<boolean>(false);
  const [timeUpAlertOpen, setTimeUpAlertOpen] = useState<boolean>(false);

  // AI Judge Results & Match History
  const [matchEvents, setMatchEvents] = useState<AIEventCard[]>([]);
  const [lastMvpName, setLastMvpName] = useState<string>('Sara (سارة)');
  const [lastMvpReasonEn, setLastMvpReasonEn] = useState<string>(
    'Controlled the ball for the longest time and scored a Fair-Play double goal!'
  );
  const [lastMvpReasonAr, setLastMvpReasonAr] = useState<string>(
    'استحوذت على الكرة لأطول فترة وسجلت هدفاً مضاعفاً بميزة اللعب النظيف!'
  );
  const [lastReportHash, setLastReportHash] = useState<string>(
    '8f94e2c1a7b309d4e5f1a8c2049d81a2c3e4f50192837465a1b2c3d4e5f60718'
  );
  const [lastPossession, setLastPossession] = useState<{ A: number; B: number }>({ A: 56, B: 44 });

  // Gemini AI Coach
  const [coachLoading, setCoachLoading] = useState<boolean>(false);
  const [coachSummaryEn, setCoachSummaryEn] = useState<string>(
    'Wonderful energy from both Falcons and Oryx! Passing between generations made this match truly special.'
  );
  const [coachSummaryAr, setCoachSummaryAr] = useState<string>(
    'حماس عائلي رائع بين فريقي الصقور والمها! التعاون بين الصغار والكبار جعل المباراة ممتعة وعادلة للجميع.'
  );
  const [coachTips, setCoachTips] = useState<CoachTip[]>([
    {
      playerName: 'Sara (سارة)',
      tipEn: 'Amazing positioning near Goal B — keep looking for quick passes!',
      tipAr: 'تمركز ممتاز قرب المرمى B — استمري في التمرير السريع!',
    },
    {
      playerName: 'Dad (أب)',
      tipEn: 'Great defensive anchor! Try setting up Sara on the left wing.',
      tipAr: 'دفاع رائع! جرب تمرير الكرات العرضية لسارة في الجناح.',
    },
    {
      playerName: 'Omar (عمر)',
      tipEn: 'Fast counter-attacks! Watch the sprint start whistle closely.',
      tipAr: 'هجمات مرتدة سريعة! ركز جيداً على صافرة الانطلاق في السباق.',
    },
    {
      playerName: 'Mum (أم)',
      tipEn: 'Unbeatable in Emirati proverbs — lead the team vocal calls!',
      tipAr: 'تألق استثنائي في الأمثال الشعبية — قودي توجيه الفريق!',
    },
  ]);

  // Custom Proverbs, Saved Games & Leaderboard
  const [proverbs, setProverbs] = useState<ProverbItem[]>(DEFAULT_PROVERBS);
  const [newProverbFirst, setNewProverbFirst] = useState<string>('');
  const [newProverbEnding, setNewProverbEnding] = useState<string>('');
  const [newProverbMeaning, setNewProverbMeaning] = useState<string>('');

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>(INITIAL_LEADERBOARD);
  const [leaderboardFilter, setLeaderboardFilter] = useState<string>('');
  const [savedGames, setSavedGames] = useState<SavedGameRecord[]>([]);

  // Alerts, Goal Celebration & ESP32 Hardware Simulation
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [goalBanner, setGoalBanner] = useState<{
    scorerName: string;
    teamName: string;
    points: number;
  } | null>(null);
  const [esp32Connected, setEsp32Connected] = useState<boolean>(false);
  const [esp32LedState, setEsp32LedState] = useState<'idle' | 'goal' | 'whistle' | 'buzzer'>('idle');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);

  const t = TRANSLATIONS[lang];

  // Sync document RTL / LTR and Dark mode
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const triggerGoalOverlay = (scorerName: string, teamName: string, points: number) => {
    playSoundEffect('goal');
    setGoalBanner({ scorerName, teamName, points });
    setEsp32LedState('goal');
    setTimeout(() => {
      setGoalBanner(null);
      setEsp32LedState('idle');
    }, 3200);
  };

  // Auth Listener & Firestore Real-Time Subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      setAuthReady(true);

      if (currUser && currUser.emailVerified) {
        const uid = currUser.uid;
        const familyPath = `families/${uid}`;
        try {
          await setDoc(
            doc(db, 'families', uid),
            {
              ownerId: uid,
              name: familyName.slice(0, 100),
              language: lang,
              voiceCommentator: voiceMode,
              fairPlayEnabled: currentRules.fairPlayAgeHandicap,
              demoMode,
              theme,
              teamAName: teamAName.slice(0, 60),
              teamBName: teamBName.slice(0, 60),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, familyPath);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.uid;

    const gamesQuery = query(collection(db, `families/${uid}/games`), where('ownerId', '==', uid));
    const unsubGames = onSnapshot(
      gamesQuery,
      (snap) => {
        const loaded: SavedGameRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          loaded.push({
            id: d.id,
            gameType: data.gameType,
            teamAName: data.teamAName,
            teamBName: data.teamBName,
            scoreA: data.scoreA,
            scoreB: data.scoreB,
            winner: data.winner,
            mvpName: data.mvpName,
            mvpReasonEn: data.mvpReasonEn,
            mvpReasonAr: data.mvpReasonAr,
            coachSummaryEn: data.coachSummaryEn,
            coachSummaryAr: data.coachSummaryAr,
            reportHash: data.reportHash,
            verified: data.verified,
            createdAt: data.createdAt,
            events: [],
          });
        });
        if (loaded.length > 0) {
          setSavedGames(loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `families/${uid}/games`)
    );

    const proverbsQuery = query(collection(db, `families/${uid}/proverbs`), where('ownerId', '==', uid));
    const unsubProverbs = onSnapshot(
      proverbsQuery,
      (snap) => {
        const custom: ProverbItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          custom.push({
            id: d.id,
            firstHalf: data.firstHalf,
            ending: data.ending,
            meaningEn: data.meaningEn,
            category: data.category || 'Family Custom · مثل عائلي',
          });
        });
        setProverbs([...DEFAULT_PROVERBS, ...custom]);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `families/${uid}/proverbs`)
    );

    return () => {
      unsubGames();
      unsubProverbs();
    };
  }, [authReady, user]);

  // Round Countdown Timer
  useEffect(() => {
    if (!roundTimerRunning) return;
    const timer = setInterval(() => {
      setRoundTimerSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRoundTimerRunning(false);
          playSoundEffect('buzzer');
          setEsp32LedState('buzzer');
          setTimeUpAlertOpen(true);
          speakCommentary(
            'Time is up! Opening AI Judge to verify the round.',
            'انتهى الوقت! افتح الحكم الذكي لمراجعة الجولة.',
            voiceMode
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [roundTimerRunning, voiceMode]);

  const handleSelectGame = (g: GameType) => {
    setSelectedGame(g);
    setRoundTimerSec(rulesMap[g].roundTimeSeconds);
    setScoreA(0);
    setScoreB(0);
    setCurrentRound(1);
    setMatchEvents([]);
    setCurrentStep(2);
    triggerToast(
      lang === 'ar'
        ? `تم اختيار اللعبة — قم بمراجعة اللاعبين والفرق`
        : `Selected ${g.replace('_', ' ').toUpperCase()} — configure players & teams`
    );
  };

  const handleAddPlayer = (preset?: { name: string; age: number; team: TeamId; colour: string; avatar: string }) => {
    if (players.length >= 6) {
      triggerToast(lang === 'ar' ? 'الحد الأقصى 6 لاعبين' : 'Maximum 6 players reached');
      return;
    }
    const nameToUse = preset ? preset.name : newPlayerName.trim();
    if (!nameToUse) return;
    const newP: Player = {
      id: `p_${Date.now()}`,
      name: nameToUse.slice(0, 60),
      age: preset ? preset.age : Math.max(1, Math.min(120, Number(newPlayerAge) || 12)),
      team: preset ? preset.team : newPlayerTeam,
      colour: preset ? preset.colour : newPlayerColour,
      avatar: preset ? preset.avatar : (preset?.age || newPlayerAge) >= 60 ? '👴🏽' : '🧑🏽',
      badges: isFairPlayEligible(preset ? preset.age : newPlayerAge) ? ['Fair-Play Star'] : [],
      ready: true,
    };
    setPlayers((prev) => [...prev, newP]);
    setNewPlayerName('');
    triggerToast(
      lang === 'ar' ? `تمت إضافة اللاعب: ${newP.name}` : `Added player: ${newP.name}`
    );
  };

  const handleSaveTeamsToFirestore = async () => {
    if (user && user.emailVerified) {
      const uid = user.uid;
      for (const p of players) {
        const cleanId = p.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = `families/${uid}/players/${cleanId}`;
        try {
          await setDoc(doc(db, `families/${uid}/players`, cleanId), {
            ownerId: uid,
            familyId: uid,
            name: p.name.slice(0, 60),
            age: p.age,
            team: p.team,
            colour: p.colour.slice(0, 20),
            avatar: p.avatar.slice(0, 30),
            badges: p.badges.slice(0, 10),
            ready: p.ready,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    }
    triggerToast(lang === 'ar' ? 'تم حفظ الفرق واللاعبين بنجاح!' : 'Teams & shirt colours saved!');
    setCurrentStep(3);
  };

  const handleTogglePlayerReady = (id: string) => {
    setPlayers((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p));
      if (next.every((p) => p.ready)) {
        playSoundEffect('ready');
        triggerToast(t.everyoneReady);
      }
      return next;
    });
  };

  const handleApplyAIJudgeResults = async (
    newEvents: AIEventCard[],
    deltaA: number,
    deltaB: number,
    mvpName: string,
    mvpReasonEn: string,
    mvpReasonAr: string,
    reportHash: string,
    possessionA?: number,
    possessionB?: number
  ) => {
    const finalA = scoreA + deltaA;
    const finalB = scoreB + deltaB;
    const allEvents = [...newEvents, ...matchEvents];

    setScoreA(finalA);
    setScoreB(finalB);
    setMatchEvents(allEvents);
    setLastMvpName(mvpName);
    setLastMvpReasonEn(mvpReasonEn);
    setLastMvpReasonAr(mvpReasonAr);
    setLastReportHash(reportHash);
    if (possessionA !== undefined && possessionB !== undefined) {
      setLastPossession({ A: possessionA, B: possessionB });
    }

    // Determine Winner (with Football Possession Tie-Break if tied)
    let winnerLabel = '';
    if (finalA > finalB) {
      winnerLabel = `${teamAName} Win ${finalA}–${finalB}`;
    } else if (finalB > finalA) {
      winnerLabel = `${teamBName} Win ${finalB}–${finalA}`;
    } else if (selectedGame === 'football' && (possessionA || 50) !== (possessionB || 50)) {
      const tieWinner = (possessionA || 50) > (possessionB || 50) ? teamAName : teamBName;
      winnerLabel = `${tieWinner} Win on Possession Tie-Break (${possessionA}%–${possessionB}%)`;
    } else {
      winnerLabel = `Family Tie ${finalA}–${finalB}`;
    }

    // Update Season Leaderboard
    setLeaderboard((prev) => {
      const map = new Map<string, LeaderboardRow>();
      prev.forEach((r) => map.set(r.playerName, { ...r }));
      players.forEach((p) => {
        if (!map.has(p.name)) {
          map.set(p.name, {
            playerId: p.id,
            playerName: p.name,
            team: p.team,
            points: 0,
            wins: 0,
            goals: 0,
            bestRaceTime: 9.99,
            correctAnswers: 0,
            fairPlayBonusCount: 0,
          });
        }
      });

      newEvents.forEach((ev) => {
        const row = map.get(ev.playerName);
        if (row) {
          row.points += Math.max(0, ev.points);
          if (ev.type === 'GOAL') row.goals += 1;
          if (ev.type === 'PHOTO_FINISH' && ev.timeSec > 0) {
            row.bestRaceTime = Math.min(row.bestRaceTime, ev.timeSec);
          }
          if (ev.type === 'PROVERB_CORRECT' || ev.type === 'PROVERB_STEAL') {
            row.correctAnswers += 1;
          }
          if (ev.points >= 2 && ev.type === 'GOAL') {
            row.fairPlayBonusCount += 1;
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => b.points - a.points);
    });

    const record: SavedGameRecord = {
      id: `game_${Date.now()}`,
      gameType: selectedGame,
      teamAName,
      teamBName,
      scoreA: finalA,
      scoreB: finalB,
      winner: winnerLabel,
      mvpName,
      mvpReasonEn,
      mvpReasonAr,
      coachSummaryEn,
      coachSummaryAr,
      reportHash,
      verified: true,
      createdAt: new Date().toISOString(),
      events: allEvents,
      possessionA,
      possessionB,
    };
    setSavedGames((prev) => [record, ...prev]);

    // Persist to Firestore if authenticated with verified email
    if (user && user.emailVerified) {
      const uid = user.uid;
      const gameId = record.id;
      const gamePath = `families/${uid}/games/${gameId}`;
      try {
        await setDoc(doc(db, `families/${uid}/games`, gameId), {
          ownerId: uid,
          familyId: uid,
          gameType: selectedGame,
          teamAName: teamAName.slice(0, 60),
          teamBName: teamBName.slice(0, 60),
          scoreA: finalA,
          scoreB: finalB,
          winner: winnerLabel.slice(0, 80),
          mvpName: mvpName.slice(0, 60),
          mvpReasonEn: mvpReasonEn.slice(0, 300),
          mvpReasonAr: mvpReasonAr.slice(0, 300),
          coachSummaryEn: coachSummaryEn.slice(0, 1000),
          coachSummaryAr: coachSummaryAr.slice(0, 1000),
          reportHash: reportHash.slice(0, 128),
          verified: true,
          createdAt: record.createdAt,
        });

        for (const ev of newEvents.slice(0, 6)) {
          const evId = ev.id.replace(/[^a-zA-Z0-9_-]/g, '_');
          await setDoc(doc(db, `families/${uid}/games/${gameId}/events`, evId), {
            ownerId: uid,
            familyId: uid,
            gameId,
            timeSec: ev.timeSec,
            type: ev.type.slice(0, 40),
            team: ev.team.slice(0, 20),
            playerName: ev.playerName.slice(0, 60),
            points: ev.points,
            reasonEn: ev.reasonEn.slice(0, 300),
            reasonAr: ev.reasonAr.slice(0, 300),
            thumbnailDataUrl: (ev.thumbnailDataUrl || '').slice(0, 140000),
            verified: true,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, gamePath);
      }
    }

    triggerToast(lang === 'ar' ? 'تم اعتماد نتائج الحكم الذكي الموثقة ✔' : 'Results applied & verified ✔');
    setCurrentStep(6);

    // Fetch live Gemini AI Coach Summary & Player Tips
    requestGeminiCoachSummary(selectedGame, finalA, finalB, winnerLabel, mvpName, allEvents);
  };

  const requestGeminiCoachSummary = async (
    gType: GameType,
    finalA: number,
    finalB: number,
    winner: string,
    mvpName: string,
    events: AIEventCard[]
  ) => {
    setCoachLoading(true);
    try {
      const res = await fetch('/api/gemini/coach-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: gType,
          teamAName,
          teamBName,
          scoreA: finalA,
          scoreB: finalB,
          winner,
          mvpName,
          players,
          events,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summaryEn) setCoachSummaryEn(data.summaryEn);
        if (data.summaryAr) setCoachSummaryAr(data.summaryAr);
        if (Array.isArray(data.playerTips) && data.playerTips.length > 0) {
          setCoachTips(data.playerTips);
        }
      }
    } catch {
      // Keep default warm family coach summary if offline
    } finally {
      setCoachLoading(false);
    }
  };

  const handleAddCustomProverb = async () => {
    if (!newProverbFirst.trim() || !newProverbEnding.trim()) return;
    const newId = `prov_custom_${Date.now()}`;
    const item: ProverbItem = {
      id: newId,
      firstHalf: newProverbFirst.trim().slice(0, 200),
      ending: newProverbEnding.trim().slice(0, 200),
      meaningEn: (newProverbMeaning.trim() || 'Custom family heritage proverb').slice(0, 300),
      category: 'Family Custom · مثل عائلي',
    };
    setProverbs((prev) => [...prev, item]);
    setNewProverbFirst('');
    setNewProverbEnding('');
    setNewProverbMeaning('');

    if (user && user.emailVerified) {
      const uid = user.uid;
      try {
        await setDoc(doc(db, `families/${uid}/proverbs`, newId), {
          ownerId: uid,
          familyId: uid,
          firstHalf: item.firstHalf,
          ending: item.ending,
          meaningEn: item.meaningEn,
          category: item.category,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `families/${uid}/proverbs/${newId}`);
      }
    }
    triggerToast(lang === 'ar' ? 'تمت إضافة المثل العائلي بنجاح!' : 'Added custom family proverb!');
  };

  const handleDeleteAllFamilyData = async () => {
    setPlayers(DEFAULT_PLAYERS);
    setSavedGames([]);
    setMatchEvents([]);
    setProverbs(DEFAULT_PROVERBS);
    setLeaderboard(INITIAL_LEADERBOARD);
    setConfirmDeleteOpen(false);

    if (user && user.emailVerified) {
      const uid = user.uid;
      try {
        const subcols = ['players', 'games', 'proverbs', 'leaderboard'];
        for (const sub of subcols) {
          const q = query(collection(db, `families/${uid}/${sub}`), where('ownerId', '==', uid));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            await deleteDoc(doc(db, `families/${uid}/${sub}`, d.id));
          }
        }
        await deleteDoc(doc(db, 'families', uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `families/${uid}`);
      }
    }
    triggerToast(
      lang === 'ar'
        ? 'تم حذف جميع البيانات العائلية المحفوظة بنجاح'
        : 'All family data deleted cleanly per privacy controls'
    );
  };

  const handleConnectEsp32 = async () => {
    try {
      const nav = navigator as unknown as { bluetooth?: { requestDevice: (opts: unknown) => Promise<unknown> } };
      if (nav.bluetooth) {
        await nav.bluetooth.requestDevice({ acceptAllDevices: true });
      }
      setEsp32Connected(true);
      triggerToast(lang === 'ar' ? 'تم توصيل وحدة ESP32 بنجاح!' : 'ESP32 Buzzer & LED Strip paired!');
    } catch {
      setEsp32Connected(true);
      triggerToast(
        lang === 'ar'
          ? 'تم تفعيل محاكي ESP32 الافتراضي (Buzzer + LED Strip)'
          : 'Virtual ESP32 Buzzer & LED Strip active!'
      );
    }
  };

  const steps = [
    { num: 1 as const, label: t.step1 },
    { num: 2 as const, label: t.step2 },
    { num: 3 as const, label: t.step3 },
    { num: 4 as const, label: t.step4 },
    { num: 5 as const, label: t.step5 },
    { num: 6 as const, label: t.step6 },
  ];

  const allPlayersReady = players.every((p) => p.ready);
  const activeTurnPlayer = players[activeTurnIdx % Math.max(1, players.length)] || players[0];

  return (
    <div
      className={`min-h-screen transition-colors ${
        theme === 'dark' ? 'bg-[#0D1B1E] text-slate-100' : 'bg-[#F7F9F9] text-[#12262A]'
      } ${demoMode ? 'text-lg' : 'text-base'}`}
    >
      {/* Full-Screen GOAL! Celebration Overlay */}
      {goalBanner && (
        <div className="fixed inset-0 z-50 bg-[#12262A]/90 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#0B6A64] border-4 border-[#F2B33D] rounded-2xl p-8 text-center text-white space-y-3 shadow-2xl">
            <div className="text-5xl font-extrabold tracking-tight text-[#F2B33D] font-display">
              GOAL! · هـدف! ⚽
            </div>
            <p className="text-2xl font-bold">
              {goalBanner.scorerName} ({goalBanner.teamName})
            </p>
            <p className="text-sm text-[#5CC4B9] font-mono tabular-nums">
              +{goalBanner.points} PTS · AI VISION REFEREE VERIFIED ✔
            </p>
          </div>
        </div>
      )}

      {/* Time-Up Modal Alert */}
      {timeUpAlertOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center space-y-4">
            <div className="text-3xl font-bold text-[#E4572E]">
              {lang === 'ar' ? '⏰ انتهى وقت الجولة!' : '⏰ Round Time Is Up!'}
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              {lang === 'ar'
                ? 'انتقل الآن إلى الحكم الذكي (الخطوة 5) لمراجعة الفيديو أو الصوت واعتماد النتيجة.'
                : 'Proceed to the AI Judge (Step 5) to review the captured video/audio evidence and apply points.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setTimeUpAlertOpen(false);
                  setCurrentStep(5);
                }}
                className="px-5 py-2.5 rounded-lg bg-[#0B6A64] text-white font-semibold text-sm cursor-pointer"
              >
                {lang === 'ar' ? 'افتح الحكم الذكي' : 'Open AI Judge'}
              </button>
              <button
                type="button"
                onClick={() => setTimeUpAlertOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                {lang === 'ar' ? 'إغلاق' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-40 max-w-sm bg-[#12262A] text-white border border-[#5CC4B9] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#5CC4B9] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Bar Contract (3 Zones: 1-line Brand Wordmark | 5 Single-Line Nav Links | 1 Primary Action Cluster) */}
      <header className="bg-[#12262A] text-white border-b border-white/10">
        <div className="max-w-[1360px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <Eye className="w-5 h-5 text-[#F2B33D]" />
            <span>Hakam AI · حَكَم</span>
          </a>

          {/* Zone 2: 5 Single-Line Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'dashboard' ? 'text-[#F2B33D] underline underline-offset-8' : ''
              }`}
            >
              {t.navDashboard}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('arena')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'arena' ? 'text-[#F2B33D] underline underline-offset-8' : ''
              }`}
            >
              {t.navGameFlow}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'leaderboard' ? 'text-[#F2B33D] underline underline-offset-8' : ''
              }`}
            >
              {t.navLeaderboard}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'guide' ? 'text-[#F2B33D] underline underline-offset-8' : ''
              }`}
            >
              {t.navGuide}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'settings' ? 'text-[#F2B33D] underline underline-offset-8' : ''
              }`}
            >
              {t.navSettings}
            </button>
          </nav>

          {/* Zone 3: Language Switch & Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = lang === 'en' ? 'ar' : 'en';
                setLang(next);
                if (voiceMode !== 'off') setVoiceMode(next);
              }}
              className="px-3.5 py-2 text-xs font-bold bg-[#0B6A64] hover:bg-[#0e8079] text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'en' ? 'العربية (AR)' : 'English (EN)'}
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Workspace Toolbar: Mobile Nav + Voice Commentator + Demo Mode + 6-Step Stepper */}
      <div className="bg-white dark:bg-[#14292E] border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1360px] mx-auto px-6 py-3 space-y-3">
          {/* Mobile Navigation & Quick Utility Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex md:hidden flex-wrap items-center gap-2">
              {(['dashboard', 'arena', 'leaderboard', 'guide', 'settings'] as MainTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-2.5 py-1.5 rounded font-semibold whitespace-nowrap shrink-0 ${
                    activeTab === tab
                      ? 'bg-[#0B6A64] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-700 dark:text-slate-200 dark:text-slate-300 font-medium">
              {t.tagline} · <strong className="text-[#0B6A64] dark:text-[#5CC4B9]">{familyName}</strong>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Voice Commentator Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <Volume2 className="w-3.5 h-3.5 text-[#0B6A64] ml-1.5" />
                {(['en', 'ar', 'off'] as VoiceMode[]).map((vm) => (
                  <button
                    key={vm}
                    type="button"
                    onClick={() => setVoiceMode(vm)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      voiceMode === vm
                        ? 'bg-white dark:bg-slate-700 text-[#12262A] dark:text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {vm === 'en' ? 'Voice EN' : vm === 'ar' ? 'تعليق ع' : 'Mute'}
                  </button>
                ))}
              </div>

              {/* Projector Demo Mode */}
              <button
                type="button"
                onClick={() => setDemoMode((d) => !d)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  demoMode
                    ? 'bg-[#F2B33D] text-[#12262A]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {lang === 'ar' ? 'وضع العرض (Demo)' : 'Projector Demo Mode'}
              </button>

              {/* Light / Dark Mode */}
              <button
                type="button"
                onClick={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Firebase Google Auth / Guest Indicator */}
              {user ? (
                <button
                  type="button"
                  onClick={() => logOutFirebase()}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{user.displayName?.split(' ')[0] || t.signOut}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    signInWithGoogle().catch(() =>
                      triggerToast(
                        lang === 'ar'
                          ? 'وضع الضيف العائلي نشط ويعمل بالكامل'
                          : 'Family Guest Mode active & ready'
                      )
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#0B6A64]/10 text-[#0B6A64] dark:text-[#5CC4B9] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t.signInGoogle}</span>
                </button>
              )}
            </div>
          </div>

          {/* 6-Step Top Stepper (always visible when in Arena or clickable from anywhere) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            {steps.map((st) => {
              const isCurrent = activeTab === 'arena' && currentStep === st.num;
              const isDone = currentStep > st.num;
              return (
                <button
                  key={st.num}
                  type="button"
                  onClick={() => {
                    setActiveTab('arena');
                    setCurrentStep(st.num);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between gap-2 whitespace-nowrap shrink-0 cursor-pointer border ${
                    isCurrent
                      ? 'bg-[#0B6A64] text-white border-[#0B6A64]'
                      : isDone
                      ? 'bg-[#5CC4B9]/15 text-[#0B6A64] dark:text-[#5CC4B9] border-[#5CC4B9]/40'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="truncate">{st.label}</span>
                  {isDone && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="max-w-[1360px] mx-auto px-6 py-8 space-y-8">
        {/* ====================================================================
            VIEW 1: HOME DASHBOARD
        ==================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Hero Welcome Card */}
            <div className="bg-[#12262A] text-white rounded-2xl p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="text-xs font-mono text-[#5CC4B9]">
                  UAE YEAR OF FAMILY 2026 · FAMILY AI GAME DAY
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-display">
                  {lang === 'ar'
                    ? 'حَكَم AI — الحكم الذكي العادل لألعاب العائلة'
                    : 'Hakam AI (حَكَم) — The Fair AI Referee for Family Game Day'}
                </h1>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
                  {lang === 'ar'
                    ? 'العبوا في الواقع ودعوا الحكم الذكي يراقب الفيديو والصوت، يطبق القوانين بعدل، يمنح ميزة اللعب النظيف للأطفال وكبار السن، ويوثق كل قرار بالصورة والدليل.'
                    : 'Your family plays for real while Hakam AI watches and listens via camera and microphone — applying rules fairly, protecting kids & grandparents with Fair-Play Age Handicaps, and explaining every call with frame evidence.'}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('arena');
                      setCurrentStep(1);
                    }}
                    className="px-6 py-3 rounded-xl bg-[#F2B33D] hover:bg-[#e3a32c] text-[#12262A] font-extrabold text-sm flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    {t.startGameDay}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('leaderboard')}
                    className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm cursor-pointer"
                  >
                    {t.navLeaderboard}
                  </button>
                </div>
              </div>

              {/* Quick Family Scoreboard Summary */}
              <div className="lg:col-span-5 bg-[#183136] border border-white/10 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between text-xs text-[#5CC4B9] font-mono">
                  <span>ACTIVE FAMILY ROSTER</span>
                  <span>{players.length} PLAYERS</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg bg-[#E4572E]/20 border border-[#E4572E]/40">
                    <div className="text-xs text-slate-300">{teamAName} (Team A)</div>
                    <div className="text-2xl font-extrabold text-[#E4572E] font-mono tabular-nums mt-0.5">
                      {players
                        .filter((p) => p.team === 'A')
                        .map((p) => p.name.split(' ')[0])
                        .join(', ')}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#2F6FD6]/20 border border-[#2F6FD6]/40">
                    <div className="text-xs text-slate-300">{teamBName} (Team B)</div>
                    <div className="text-2xl font-extrabold text-[#5CC4B9] font-mono tabular-nums mt-0.5">
                      {players
                        .filter((p) => p.team === 'B')
                        .map((p) => p.name.split(' ')[0])
                        .join(', ')}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-300 pt-1">
                  {t.fairPlayBanner}
                </div>
              </div>
            </div>

            {/* 4 Family Trophies / Badges Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  badge: 'Golden Boot · الحذاء الذهبي',
                  holder: 'Sara (سارة)',
                  stat: '6 Goals (2x Youth Bonus)',
                  color: '#F2B33D',
                },
                {
                  badge: 'Fastest Falcon · أسرع صقر',
                  holder: 'Sara (سارة)',
                  stat: '5.42s Camel Sprint Photo Finish',
                  color: '#E4572E',
                },
                {
                  badge: 'Proverb Master · حكيم الأمثال',
                  holder: 'Mum (أم)',
                  stat: '8 Emirati Proverbs Completed',
                  color: '#0B6A64',
                },
                {
                  badge: 'Fair-Play Star · نجم اللعب النظيف',
                  holder: 'Dad (أب)',
                  stat: '100% Verified SHA-256 Matches',
                  color: '#2F6FD6',
                },
              ].map((tr) => (
                <div
                  key={tr.badge}
                  className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Trophy className="w-5 h-5" style={{ color: tr.color }} />
                    <span className="text-xs font-mono text-slate-400">2026 SEASON</span>
                  </div>
                  <div className="font-bold text-sm text-[#12262A] dark:text-white">{tr.badge}</div>
                  <div className="text-base font-extrabold text-[#0B6A64] dark:text-[#5CC4B9]">{tr.holder}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-300 font-mono tabular-nums">
                    {tr.stat}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            VIEW 2: 6-STEP GAME ARENA
        ==================================================================== */}
        {activeTab === 'arena' && (
          <div className="space-y-8">
            {/* STEP 1: CHOOSE A GAME */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-[#12262A] dark:text-white font-display">
                      {t.step1}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      {lang === 'ar'
                        ? 'اختر إحدى الألعاب الثلاث المدعومة بالرؤية الحاسوبية، تحليل الصوت، والتعرف على الأمثال الإماراتية.'
                        : 'Choose one of our 3 heritage & sport family games powered by browser Computer Vision, Web Audio, and Arabic Speech AI.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                  {(
                    [
                      {
                        id: 'football' as GameType,
                        title: t.footballTitle,
                        meta: t.footballSub,
                        desc: t.footballDesc,
                        icon: '⚽',
                      },
                      {
                        id: 'camel_race' as GameType,
                        title: t.camelTitle,
                        meta: t.camelSub,
                        desc: t.camelDesc,
                        icon: '🐪',
                      },
                      {
                        id: 'proverb_relay' as GameType,
                        title: t.proverbTitle,
                        meta: t.proverbSub,
                        desc: t.proverbDesc,
                        icon: '📜',
                      },
                    ] as const
                  ).map((g) => (
                    <div
                      key={g.id}
                      className={`bg-white dark:bg-[#183136] border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                        selectedGame === g.id
                          ? 'border-[#0B6A64] ring-2 ring-[#0B6A64]/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* High-Fidelity Generated Artwork with Fallback Container */}
                        <div className="relative h-48 bg-gradient-to-br from-[#12262A] to-[#0B6A64] overflow-hidden">
                          <img
                            src={GAME_IMAGES[g.id]}
                            alt={g.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex items-end p-4">
                            <div className="text-white">
                              <div className="text-xs text-[#F2B33D] font-medium">{g.meta}</div>
                              <h3 className="text-xl font-bold mt-0.5">
                                {g.icon} {g.title}
                              </h3>
                            </div>
                          </div>
                        </div>

                        <div className="p-5 space-y-3">
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {g.desc}
                          </p>
                        </div>
                      </div>

                      <div className="p-5 pt-0">
                        <button
                          type="button"
                          onClick={() => handleSelectGame(g.id)}
                          className="w-full py-3 px-4 rounded-xl bg-[#0B6A64] hover:bg-[#09534E] text-white font-bold text-sm transition-colors cursor-pointer"
                        >
                          {lang === 'ar' ? 'ابدأ إعداد هذه اللعبة ←' : 'Select Game & Setup Teams →'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: PLAYERS & TEAMS */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#12262A] dark:text-white font-display">
                      {t.step2}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {lang === 'ar'
                        ? 'أضف من 2 إلى 6 لاعبين، حدد الأعمار لتفعيل ميزة اللعب النظيف تلقائياً، واختر ألوان القمصان.'
                        : 'Configure 2–6 family players, ages (auto-detects <10 and 60+ Fair-Play Handicap), teams, and shirt colours.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveTeamsToFirestore}
                    className="px-6 py-3 rounded-xl bg-[#0B6A64] hover:bg-[#09534E] text-white font-bold text-sm cursor-pointer"
                  >
                    {lang === 'ar' ? 'حفظ الفرق والانتقال للقوانين ←' : 'Save Teams & Next: Rules →'}
                  </button>
                </div>

                {/* Team Names Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full bg-[#E4572E]" />
                      <span className="text-xs font-bold text-slate-500">TEAM A NAME</span>
                    </div>
                    <input
                      type="text"
                      value={teamAName}
                      onChange={(e) => setTeamAName(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 font-bold text-sm bg-transparent"
                    />
                  </div>
                  <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full bg-[#2F6FD6]" />
                      <span className="text-xs font-bold text-slate-500">TEAM B NAME</span>
                    </div>
                    <input
                      type="text"
                      value={teamBName}
                      onChange={(e) => setTeamBName(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 font-bold text-sm bg-transparent"
                    />
                  </div>
                </div>

                {/* Players Table */}
                <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500">
                          <th className="py-3.5 px-4">{lang === 'ar' ? 'اللاعب' : 'Player'}</th>
                          <th className="py-3.5 px-4">{lang === 'ar' ? 'العمر' : 'Age'}</th>
                          <th className="py-3.5 px-4">{lang === 'ar' ? 'الفريق' : 'Team'}</th>
                          <th className="py-3.5 px-4">{lang === 'ar' ? 'لون القميص (للكاميرا)' : 'Shirt Colour (CV)'}</th>
                          <th className="py-3.5 px-4">{lang === 'ar' ? 'ميزة اللعب النظيف' : 'Fair-Play Status'}</th>
                          <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'إجراء' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 text-sm">
                        {players.map((p, idx) => {
                          const fpLabel = getFairPlayLabel(p.age, lang);
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4 font-bold flex items-center gap-2">
                                <span>{p.avatar}</span>
                                <input
                                  type="text"
                                  value={p.name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPlayers((prev) =>
                                      prev.map((item) => (item.id === p.id ? { ...item, name: val } : item))
                                    );
                                  }}
                                  className="px-2 py-1 rounded border border-transparent hover:border-slate-300 bg-transparent font-bold"
                                />
                                <span className="text-xs font-mono text-slate-400">P{idx + 1}</span>
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums">
                                <input
                                  type="number"
                                  min={3}
                                  max={105}
                                  value={p.age}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setPlayers((prev) =>
                                      prev.map((item) => (item.id === p.id ? { ...item, age: val } : item))
                                    );
                                  }}
                                  className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent font-mono tabular-nums"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  value={p.team}
                                  onChange={(e) => {
                                    const val = e.target.value as TeamId;
                                    setPlayers((prev) =>
                                      prev.map((item) => (item.id === p.id ? { ...item, team: val } : item))
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent font-semibold text-xs"
                                >
                                  <option value="A">Team A ({teamAName})</option>
                                  <option value="B">Team B ({teamBName})</option>
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={p.colour}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setPlayers((prev) =>
                                        prev.map((item) => (item.id === p.id ? { ...item, colour: val } : item))
                                      );
                                    }}
                                    className="w-8 h-8 rounded cursor-pointer border-0"
                                  />
                                  <span className="font-mono text-xs uppercase">{p.colour}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs">
                                {fpLabel ? (
                                  <span className="font-semibold text-[#0B6A64] dark:text-[#5CC4B9]">
                                    ★ {fpLabel}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    {lang === 'ar' ? 'قياسي' : 'Standard Adult/Teen'}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  disabled={players.length <= 2}
                                  onClick={() => setPlayers((prev) => prev.filter((item) => item.id !== p.id))}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Player Footer Row */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder={lang === 'ar' ? 'اسم اللاعب الجديد...' : 'New player name...'}
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                      <input
                        type="number"
                        min={3}
                        max={100}
                        value={newPlayerAge}
                        onChange={(e) => setNewPlayerAge(Number(e.target.value))}
                        className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                      <select
                        value={newPlayerTeam}
                        onChange={(e) => setNewPlayerTeam(e.target.value as TeamId)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      >
                        <option value="A">Team A ({teamAName})</option>
                        <option value="B">Team B ({teamBName})</option>
                      </select>
                      <input
                        type="color"
                        value={newPlayerColour}
                        onChange={(e) => setNewPlayerColour(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPlayer()}
                        className="px-3.5 py-1.5 rounded-lg bg-[#0B6A64] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {lang === 'ar' ? 'إضافة لاعب' : 'Add Player'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleAddPlayer({
                          name: 'Grandpa Rashid (الجد راشد)',
                          age: 68,
                          team: 'A',
                          colour: '#9333EA',
                          avatar: '👴🏽',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg border border-[#0B6A64] text-[#0B6A64] dark:text-[#5CC4B9] text-xs font-semibold hover:bg-[#0B6A64]/10 cursor-pointer"
                    >
                      {lang === 'ar'
                        ? '+ إضافة الجد راشد (68 سنة — ميزة كبار السن)'
                        : '+ Add Grandpa Rashid (68 yrs · 60+ Fair-Play)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: RULES & EVERYONE READY */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#12262A] dark:text-white font-display">
                      {t.step3}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {lang === 'ar'
                        ? 'راجع القوانين أو عدلها، وتأكد من ضغط كل فرد من العائلة على زر "جاهز" قبل الانطلاق.'
                        : 'Customize match rules and verify every family member taps Ready before starting.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left 7 Cols: Editable Rules */}
                  <div className="lg:col-span-7 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                    <h3 className="font-bold text-lg text-[#12262A] dark:text-white">
                      {lang === 'ar' ? 'إعدادات وقوانين اللعبة (قابلة للتعديل)' : 'Editable Game Rules & Fair-Play'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {lang === 'ar' ? 'النقاط الأساسية' : 'Base Points'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={currentRules.pointsPerWinOrGoal}
                          onChange={(e) =>
                            setRulesMap((prev) => ({
                              ...prev,
                              [selectedGame]: {
                                ...prev[selectedGame],
                                pointsPerWinOrGoal: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 font-mono tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {lang === 'ar' ? 'وقت الجولة (ثانية)' : 'Round Time (sec)'}
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={600}
                          value={currentRules.roundTimeSeconds}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRoundTimerSec(val);
                            setRulesMap((prev) => ({
                              ...prev,
                              [selectedGame]: {
                                ...prev[selectedGame],
                                roundTimeSeconds: val,
                              },
                            }));
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 font-mono tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {lang === 'ar' ? 'العقوبة (ثانية / نقاط)' : 'Penalty Value'}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={10}
                          value={currentRules.penaltyValue}
                          onChange={(e) =>
                            setRulesMap((prev) => ({
                              ...prev,
                              [selectedGame]: {
                                ...prev[selectedGame],
                                penaltyValue: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {lang === 'ar' ? 'قاعدة كسر التعادل (Tie-Break Rule)' : 'Tie-Break Rule'}
                        </label>
                        <input
                          type="text"
                          value={lang === 'ar' ? currentRules.tieBreakRuleAr : currentRules.tieBreakRuleEn}
                          onChange={(e) =>
                            setRulesMap((prev) => ({
                              ...prev,
                              [selectedGame]: {
                                ...prev[selectedGame],
                                [lang === 'ar' ? 'tieBreakRuleAr' : 'tieBreakRuleEn']: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {lang === 'ar' ? 'معيار اختيار أفضل لاعب (MVP Rule)' : 'MVP Selection Rule'}
                        </label>
                        <input
                          type="text"
                          value={lang === 'ar' ? currentRules.mvpRuleAr : currentRules.mvpRuleEn}
                          onChange={(e) =>
                            setRulesMap((prev) => ({
                              ...prev,
                              [selectedGame]: {
                                ...prev[selectedGame],
                                [lang === 'ar' ? 'mvpRuleAr' : 'mvpRuleEn']: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                    </div>

                    {/* Fair-Play Age Handicap Toggle */}
                    <div className="p-4 rounded-xl bg-[#0B6A64]/10 border border-[#0B6A64]/30 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-sm text-[#12262A] dark:text-white">
                          {lang === 'ar'
                            ? 'تفعيل ميزة اللعب النظيف للعمر (Fair-Play Age Handicap)'
                            : 'Fair-Play Age Handicap (<10 yrs & 60+ yrs)'}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          {t.fairPlayBanner}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={currentRules.fairPlayAgeHandicap}
                        onChange={(e) =>
                          setRulesMap((prev) => ({
                            ...prev,
                            [selectedGame]: {
                              ...prev[selectedGame],
                              fairPlayAgeHandicap: e.target.checked,
                            },
                          }))
                        }
                        className="w-5 h-5 accent-[#0B6A64] cursor-pointer shrink-0"
                      />
                    </div>
                  </div>

                  {/* Right 5 Cols: "Everyone Ready" Check */}
                  <div className="lg:col-span-5 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg text-[#12262A] dark:text-white">
                        {lang === 'ar' ? 'تأكيد استعداد الجميع' : 'Everyone Ready Check'}
                      </h3>
                      <span className="text-xs font-mono tabular-nums text-[#0B6A64] dark:text-[#5CC4B9]">
                        {players.filter((p) => p.ready).length}/{players.length} READY
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {players.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleTogglePlayerReady(p.id)}
                          className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                            p.ready
                              ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">{p.avatar}</span>
                            <div>
                              <div className="font-bold text-sm">{p.name}</div>
                              <div className="text-xs text-slate-500">
                                Age {p.age} · Team {p.team}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-bold px-3 py-1 rounded-lg ${
                              p.ready
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                            }`}
                          >
                            {p.ready
                              ? lang === 'ar'
                                ? '✔ جاهز'
                                : '✔ Ready'
                              : lang === 'ar'
                              ? 'اضغط للاستعداد'
                              : 'Tap Ready'}
                          </span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={!allPlayersReady}
                      onClick={() => {
                        setRoundTimerSec(currentRules.roundTimeSeconds);
                        setCurrentStep(4);
                      }}
                      className="w-full py-3.5 px-5 rounded-xl bg-[#0B6A64] hover:bg-[#09534E] disabled:opacity-40 text-white font-extrabold text-sm transition-colors cursor-pointer"
                    >
                      {lang === 'ar' ? 'ابدأ الجولة الآن (Start Game) ←' : 'Start Round in Play →'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: ROUND IN PLAY */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="bg-[#12262A] text-white rounded-2xl p-8 space-y-6">
                  {/* Top Round & Turn Status */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div className="text-sm font-mono text-[#5CC4B9]">
                      ROUND {currentRound} OF {currentRules.totalRounds} ·{' '}
                      {activeTurnPlayer.name.toUpperCase()}&apos;S TURN
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTurnIdx((i) => (i + 1) % players.length)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
                      >
                        {lang === 'ar' ? 'تبديل دور اللاعب' : 'Next Player Turn'}
                      </button>
                    </div>
                  </div>

                  {/* Big Scoreboard & Countdown Timer */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center text-center">
                    <div className="p-6 rounded-xl bg-[#E4572E]/20 border border-[#E4572E]/50 space-y-1">
                      <div className="text-sm font-bold text-[#E4572E]">{teamAName} (Team A)</div>
                      <div className="text-5xl font-extrabold font-mono tabular-nums">{scoreA}</div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-mono text-slate-400">OFFICIAL ROUND CLOCK</div>
                      <div className="text-6xl font-extrabold text-[#F2B33D] font-mono tabular-nums">
                        {String(Math.floor(roundTimerSec / 60)).padStart(2, '0')}:
                        {String(roundTimerSec % 60).padStart(2, '0')}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRoundTimerRunning((r) => !r)}
                          className="px-4 py-2 rounded-lg bg-[#0B6A64] hover:bg-[#0e8079] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          {roundTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          {roundTimerRunning
                            ? lang === 'ar'
                              ? 'إيقاف مؤقت'
                              : 'Pause'
                            : lang === 'ar'
                            ? 'تشغيل المؤقت'
                            : 'Start Timer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRoundTimerRunning(false);
                            setRoundTimerSec(currentRules.roundTimeSeconds);
                          }}
                          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
                        </button>
                      </div>
                    </div>

                    <div className="p-6 rounded-xl bg-[#2F6FD6]/20 border border-[#2F6FD6]/50 space-y-1">
                      <div className="text-sm font-bold text-[#5CC4B9]">{teamBName} (Team B)</div>
                      <div className="text-5xl font-extrabold font-mono tabular-nums">{scoreB}</div>
                    </div>
                  </div>

                  {/* Challenge Description & Start Signal / Open AI Judge */}
                  <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-[#F2B33D] font-bold">
                        {lang === 'ar' ? 'التحدي الحالي:' : 'CURRENT CHALLENGE:'}
                      </div>
                      <p className="text-sm text-slate-200">
                        {selectedGame === 'football'
                          ? lang === 'ar'
                            ? 'العبوا مباراة كرة القدم أمام الكاميرا — الحكم الذكي يتابع القمصان والكرة ويحسب الاستحواذ والأهداف.'
                            : 'Play courtyard mini-football in camera view — AI tracks shirt colours, ball possession, and goals.'
                          : selectedGame === 'camel_race'
                          ? lang === 'ar'
                            ? 'استعدوا خلف خط البداية وانتظروا صافرة الحكم الذكي للانطلاق نحو خط النهاية!'
                            : 'Line up at the start and wait for the official whistle burst (>=13 dB) before sprinting!'
                          : lang === 'ar'
                          ? 'استمع للشطر الأول من المثل الإماراتي وأكمل الشطر الثاني بصوتك في الميكروفون.'
                          : 'Listen to the first half of the Emirati proverb and speak the ending clearly into the microphone.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {selectedGame === 'camel_race' && (
                        <button
                          type="button"
                          onClick={() => {
                            playSoundEffect('whistle');
                            setEsp32LedState('whistle');
                            triggerToast(
                              lang === 'ar'
                                ? 'انطلقت صافرة البداية الرسمية! 🐪'
                                : 'Official Start Whistle Signal Played! 🐪'
                            );
                          }}
                          className="px-4 py-3 rounded-xl bg-[#E4572E] hover:bg-[#d14820] text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                          {lang === 'ar' ? 'إطلاق صافرة البداية' : 'Play Start Signal (Whistle)'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setCurrentStep(5)}
                        className="px-6 py-3 rounded-xl bg-[#F2B33D] hover:bg-[#e0a229] text-[#12262A] font-extrabold text-sm flex items-center gap-2 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        {lang === 'ar' ? 'افتح الحكم الذكي (الخطوة 5) ←' : 'Open AI Judge (Step 5) →'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: AI JUDGE RESULTS */}
            {currentStep === 5 && (
              <div className="space-y-6">
                {selectedGame === 'proverb_relay' ? (
                  <ProverbRefereePanel
                    proverbs={proverbs}
                    players={players}
                    currentPlayerIndex={activeTurnIdx}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    rules={currentRules}
                    lang={lang}
                    voiceMode={voiceMode}
                    onApplyResults={handleApplyAIJudgeResults}
                    onToast={triggerToast}
                  />
                ) : (
                  <VisionRefereePanel
                    gameType={selectedGame}
                    players={players}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    rules={currentRules}
                    lang={lang}
                    voiceMode={voiceMode}
                    onApplyResults={handleApplyAIJudgeResults}
                    onToast={triggerToast}
                    onTriggerGoalBanner={triggerGoalOverlay}
                  />
                )}
              </div>
            )}

            {/* STEP 6: FINAL RESULTS, GEMINI COACH & HIGHLIGHT REEL */}
            {currentStep === 6 && (
              <div className="space-y-8">
                {/* Winner Banner */}
                <div className="bg-[#12262A] text-white rounded-2xl p-8 text-center space-y-4 border-2 border-[#F2B33D]">
                  <div className="text-xs font-mono text-[#5CC4B9]">
                    SHA-256 VERIFIED MATCH RESULT · {lastReportHash.slice(0, 20)}…
                  </div>
                  <h2 className="text-3xl sm:text-5xl font-extrabold text-[#F2B33D] font-display">
                    {scoreA > scoreB
                      ? `${teamAName} Win ${scoreA}–${scoreB}!`
                      : scoreB > scoreA
                      ? `${teamBName} Win ${scoreB}–${scoreA}!`
                      : `${teamAName} ${scoreA} – ${scoreB} ${teamBName} (Possession Tie-Break: ${
                          lastPossession.A >= lastPossession.B ? teamAName : teamBName
                        })`}
                  </h2>
                  <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-300 font-mono tabular-nums">
                    <span>
                      {teamAName}: {scoreA} pts ({lastPossession.A}% poss)
                    </span>
                    <span>·</span>
                    <span>
                      {teamBName}: {scoreB} pts ({lastPossession.B}% poss)
                    </span>
                    <span>·</span>
                    <span className="text-emerald-400">✔ Verified by Hakam AI</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScoreA(0);
                        setScoreB(0);
                        setCurrentRound(1);
                        setRoundTimerSec(currentRules.roundTimeSeconds);
                        setCurrentStep(4);
                      }}
                      className="px-6 py-3 rounded-xl bg-[#0B6A64] hover:bg-[#0e8079] text-white font-bold text-sm cursor-pointer"
                    >
                      {t.rematch}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="px-6 py-3 rounded-xl bg-[#F2B33D] hover:bg-[#e0a229] text-[#12262A] font-bold text-sm cursor-pointer"
                    >
                      {t.chooseAnotherGame}
                    </button>
                  </div>
                </div>

                {/* MVP Card + Gemini AI Coach Side-by-Side */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* MVP Card */}
                  <div className="lg:col-span-5 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#E4572E]">MATCH MVP · نجم المباراة</span>
                      <Crown className="w-6 h-6 text-[#F2B33D]" />
                    </div>
                    <div className="text-2xl font-extrabold text-[#12262A] dark:text-white">{lastMvpName}</div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {lang === 'ar' ? lastMvpReasonAr : lastMvpReasonEn}
                    </p>
                  </div>

                  {/* Gemini AI Coach Summary & Player Tips */}
                  <div className="lg:col-span-7 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#0B6A64] dark:text-[#5CC4B9]" />
                        <h3 className="font-bold text-lg text-[#12262A] dark:text-white">
                          {lang === 'ar' ? 'المدرب الذكي للعائلة (Gemini AI Coach)' : 'Gemini AI Family Coach'}
                        </h3>
                      </div>
                      <button
                        type="button"
                        disabled={coachLoading}
                        onClick={() =>
                          requestGeminiCoachSummary(
                            selectedGame,
                            scoreA,
                            scoreB,
                            `${teamAName} ${scoreA}-${scoreB} ${teamBName}`,
                            lastMvpName,
                            matchEvents
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                      >
                        {coachLoading
                          ? lang === 'ar'
                            ? 'جاري التحديث...'
                            : 'Refreshing...'
                          : lang === 'ar'
                          ? 'تحديث نصائح المدرب'
                          : 'Refresh Coach Tips'}
                      </button>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {lang === 'ar' ? coachSummaryAr : coachSummaryEn}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {coachTips.map((tip, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 text-xs space-y-1"
                        >
                          <div className="font-bold text-[#0B6A64] dark:text-[#5CC4B9]">
                            {tip.playerName}
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? tip.tipAr : tip.tipEn}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Highlight Reel & Timeline of Every AI Decision */}
                <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg text-[#12262A] dark:text-white">
                      {lang === 'ar'
                        ? 'شريط اللقطات المميزة والجدول الزمني لقرارات الحكم الذكي'
                        : 'Highlight Reel & Explainable AI Decision Timeline'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `Hakam AI Match Result: ${teamAName} ${scoreA} - ${scoreB} ${teamBName} | MVP: ${lastMvpName}`
                        );
                        triggerToast(lang === 'ar' ? 'تم نسخ ملخص النتيجة للمشاركة!' : 'Match summary copied to share!');
                      }}
                      className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      {lang === 'ar' ? 'مشاركة النتيجة' : 'Share Highlights'}
                    </button>
                  </div>

                  {matchEvents.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      {lang === 'ar' ? 'لا توجد أحداث مسجلة بعد.' : 'No AI events recorded in this session yet.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {matchEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between"
                        >
                          {ev.thumbnailDataUrl && (
                            <img
                              src={ev.thumbnailDataUrl}
                              alt={ev.type}
                              referrerPolicy="no-referrer"
                              className="w-full h-36 object-cover border-b border-slate-200 dark:border-slate-700"
                            />
                          )}
                          <div className="p-4 space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500">
                              <span>
                                {ev.timeSec.toFixed(2)}s · {ev.type}
                              </span>
                              <span className="font-bold text-[#0B6A64] dark:text-[#5CC4B9]">
                                +{ev.points} pts
                              </span>
                            </div>
                            <div className="font-bold text-sm text-[#12262A] dark:text-white">
                              {ev.playerName}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {lang === 'ar' ? ev.reasonAr : ev.reasonEn}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            VIEW 3: FAMILY LEADERBOARD & TROPHIES
        ==================================================================== */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-[#12262A] dark:text-white font-display">
                  {t.navLeaderboard}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {lang === 'ar'
                    ? 'جدول الترتيب الموسمي للعائلة، الأهداف، أسرع زمن في سباق الهجن، والأمثال الصحيحة.'
                    : 'Season family standings across Football, Camel Race Sprint, and Emirati Proverb Relay.'}
                </p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'ابحث عن لاعب...' : 'Filter player...'}
                  value={leaderboardFilter}
                  onChange={(e) => setLeaderboardFilter(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#183136] text-xs"
                />
              </div>
            </div>

            <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500">
                      <th className="py-3.5 px-4">#</th>
                      <th className="py-3.5 px-4">{lang === 'ar' ? 'اللاعب' : 'Player'}</th>
                      <th className="py-3.5 px-4">{lang === 'ar' ? 'الفريق' : 'Team'}</th>
                      <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'النقاط' : 'Points'}</th>
                      <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'الأهداف ⚽' : 'Goals ⚽'}</th>
                      <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'أفضل زمن سباق 🐪' : 'Best Sprint 🐪'}</th>
                      <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'الأمثال 📜' : 'Proverbs 📜'}</th>
                      <th className="py-3.5 px-4 text-right">{lang === 'ar' ? 'اللعب النظيف ★' : 'Fair-Play ★'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 text-sm">
                    {leaderboard
                      .filter((r) => r.playerName.toLowerCase().includes(leaderboardFilter.toLowerCase()))
                      .map((row, idx) => (
                        <tr key={row.playerId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-mono font-bold text-[#0B6A64] dark:text-[#5CC4B9]">
                            0{idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-bold">{row.playerName}</td>
                          <td className="py-3.5 px-4 text-xs">
                            Team {row.team} ({row.team === 'A' ? teamAName : teamBName})
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-extrabold text-base">
                            {row.points}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">{row.goals}</td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            {row.bestRaceTime.toFixed(2)}s
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            {row.correctAnswers}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#E4572E]">
                            {row.fairPlayBonusCount}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            VIEW 4: HOW TO USE (README) & ESP32 HARDWARE ADD-ON
        ==================================================================== */}
        {activeTab === 'guide' && (
          <div className="space-y-8">
            <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
              <h2 className="text-2xl font-extrabold text-[#12262A] dark:text-white font-display">
                {lang === 'ar'
                  ? 'دليل الاستخدام — كيف يعمل حَكَم AI في 6 خطوات'
                  : 'How to Use Hakam AI — The 6-Step Family Referee Guide'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {[
                  {
                    step: '01. Choose a Game',
                    desc: 'Pick Football (Video CV), Camel Race Sprint (Video + Audio dB referee), or Proverb Relay (Arabic Speech Recognition).',
                  },
                  {
                    step: '02. Players & Teams',
                    desc: 'Add 2–6 players with ages and shirt colours. Kids <10 and Seniors 60+ automatically qualify for Fair-Play Age Handicaps.',
                  },
                  {
                    step: '03. Rules & Ready',
                    desc: 'Adjust points, timers, and penalties. Every player taps their Ready button before the match begins.',
                  },
                  {
                    step: '04. Round in Play',
                    desc: 'Use the live scoreboard, countdown clock, and official Camel Race start whistle while the family plays for real.',
                  },
                  {
                    step: '05. AI Judge Results',
                    desc: 'Teach shirt/ball colours with one click, run 256px HSV tracking or speech matching, verify SHA-256 signatures, and consult Gemini Multimodal.',
                  },
                  {
                    step: '06. Final Results & Coach',
                    desc: 'Celebrate the winner & MVP, read personalized tips from Gemini AI Coach, and share the Highlight Reel.',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    <div className="font-bold text-sm text-[#0B6A64] dark:text-[#5CC4B9]">{item.step}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ESP32 Microcontroller Add-On (Web Bluetooth / Wi-Fi Buzzer & LED Strip) */}
            <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-lg text-[#12262A] dark:text-white flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-[#0B6A64]" />
                    {lang === 'ar'
                      ? 'إضافة الهاردوير الاختيارية: متحكم ESP32 (شريط إضاءة LED وجرس تنبيه)'
                      : 'Optional Hardware Add-On: ESP32 Buzzer & LED Strip (Web Bluetooth / Wi-Fi)'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {lang === 'ar'
                      ? 'يتصل عبر Web Bluetooth ليومض باللون الذهبي عند تسجيل هدف، والأخضر عند صافرة البداية، والأحمر عند انتهاء الوقت.'
                      : 'Flashes WS2812B LEDs and triggers the piezo buzzer when Hakam AI detects a Goal, Race Start Whistle, or Time-Up.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectEsp32}
                    className="px-4 py-2 rounded-lg bg-[#0B6A64] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wifi className="w-4 h-4" />
                    {esp32Connected
                      ? lang === 'ar'
                        ? 'ESP32 متصل ✔'
                        : 'ESP32 Paired ✔'
                      : lang === 'ar'
                      ? 'اقتران عبر Web Bluetooth'
                      : 'Pair ESP32 via Web Bluetooth'}
                  </button>
                </div>
              </div>

              {/* Interactive LED Strip Preview */}
              <div className="p-4 rounded-xl bg-[#12262A] text-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-4 h-4 rounded-full transition-all ${
                        esp32LedState === 'goal'
                          ? 'bg-[#F2B33D] scale-110'
                          : esp32LedState === 'whistle'
                          ? 'bg-[#5CC4B9]'
                          : esp32LedState === 'buzzer'
                          ? 'bg-[#E4572E]'
                          : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEsp32LedState('goal');
                      playSoundEffect('goal');
                    }}
                    className="px-3 py-1.5 rounded bg-[#F2B33D] text-[#12262A] font-bold cursor-pointer"
                  >
                    Test Goal Flash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEsp32LedState('whistle');
                      playSoundEffect('whistle');
                    }}
                    className="px-3 py-1.5 rounded bg-[#5CC4B9] text-[#12262A] font-bold cursor-pointer"
                  >
                    Test Start Beep
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            VIEW 5: SETTINGS, CUSTOM PROVERBS ADMIN & DATA PRIVACY
        ==================================================================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 Cols: Family Profile, Push Reminders & Data Privacy */}
            <div className="lg:col-span-6 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
              <h2 className="text-xl font-extrabold text-[#12262A] dark:text-white font-display">
                {lang === 'ar' ? 'إعدادات العائلة والخصوصية' : 'Family Settings & Data Privacy'}
              </h2>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {lang === 'ar' ? 'اسم العائلة' : 'Family Name'}
                </label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-bold"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-bold text-sm">
                  {lang === 'ar' ? 'إشعارات يوم الألعاب العائلي' : 'Family Game Day Reminders'}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {lang === 'ar'
                    ? 'اختبر إشعار التذكير: "يبدأ يوم الألعاب العائلي الساعة 7 مساءً!"'
                    : 'Trigger notification alert: "Family Game Day starts at 7 PM!"'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    triggerToast(
                      lang === 'ar'
                        ? '🔔 تذكير: يبدأ يوم الألعاب العائلي الساعة 7:00 مساءً!'
                        : '🔔 Reminder: Family Game Day starts at 7:00 PM!'
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-[#0B6A64] text-white text-xs font-semibold cursor-pointer"
                >
                  {lang === 'ar' ? 'إرسال تذكير تجريبي' : 'Send Test Game Day Alert'}
                </button>
              </div>

              {/* Data Privacy & Ethics Section */}
              <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-3">
                <div className="font-bold text-sm text-rose-900 dark:text-rose-200">
                  {lang === 'ar'
                    ? 'خصوصية البيانات وأخلاقيات الذكاء الاصطناعي'
                    : 'Data Privacy & Ethics Controls'}
                </div>
                <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                  {lang === 'ar'
                    ? 'يتم تحليل جميع مقاطع الفيديو والصوت محلياً على جهاز العائلة ولا يتم رفعها أبداً دون إذن. يمكنك حذف جميع بيانات عائلتك في أي وقت.'
                    : 'All game videos and audio are analyzed locally on your family device and never uploaded without permission. You can permanently delete all saved family records below.'}
                </p>
                {!confirmDeleteOpen ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'حذف جميع بياناتي (Delete My Data)' : 'Delete All Family Data'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAllFamilyData}
                      className="px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {lang === 'ar' ? 'تأكيد الحذف النهائي' : 'Confirm Permanent Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right 6 Cols: Custom Family Proverbs Manager */}
            <div className="lg:col-span-6 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-extrabold text-[#12262A] dark:text-white font-display">
                {lang === 'ar'
                  ? `مكتبة الأمثال الإماراتية والعربية (${proverbs.length} مثل)`
                  : `Emirati & Arabic Proverbs Library (${proverbs.length})`}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  dir="rtl"
                  placeholder={lang === 'ar' ? 'الشطر الأول...' : 'First half (Arabic)...'}
                  value={newProverbFirst}
                  onChange={(e) => setNewProverbFirst(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs"
                />
                <input
                  type="text"
                  dir="rtl"
                  placeholder={lang === 'ar' ? 'التكملة (الشطر الثاني)...' : 'Ending (Arabic)...'}
                  value={newProverbEnding}
                  onChange={(e) => setNewProverbEnding(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs"
                />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'المعنى بالإنجليزية...' : 'English meaning...'}
                  value={newProverbMeaning}
                  onChange={(e) => setNewProverbMeaning(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleAddCustomProverb}
                className="px-4 py-2 rounded-lg bg-[#0B6A64] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {lang === 'ar' ? 'إضافة مثل عائلي جديد' : 'Add Custom Family Proverb'}
              </button>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                {proverbs.map((pr) => (
                  <div key={pr.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm text-[#12262A] dark:text-white" dir="rtl">
                        {pr.firstHalf} … <span className="text-[#0B6A64] dark:text-[#5CC4B9]">{pr.ending}</span>
                      </div>
                      <div className="text-slate-500">{pr.meaningEn}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
