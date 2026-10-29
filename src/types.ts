export type Language = 'en' | 'ar';
export type VoiceMode = 'en' | 'ar' | 'off';
export type GameType = 'football' | 'camel_race' | 'proverb_relay';
export type TeamId = 'A' | 'B';

export interface Player {
  id: string;
  name: string;
  age: number;
  team: TeamId;
  colour: string;
  avatar: string;
  badges: string[];
  ready: boolean;
}

export interface GameRules {
  gameType: GameType;
  pointsPerWinOrGoal: number;
  roundTimeSeconds: number;
  totalRounds: number;
  penaltyValue: number;
  tieBreakRuleEn: string;
  tieBreakRuleAr: string;
  mvpRuleEn: string;
  mvpRuleAr: string;
  fairPlayAgeHandicap: boolean;
}

export interface DetectionBox {
  label: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  colour: string;
}

export interface AIEventCard {
  id: string;
  timeSec: number;
  type:
    | 'GOAL'
    | 'OWN_GOAL'
    | 'POSSESSION_MVP'
    | 'RACE_START'
    | 'FALSE_START'
    | 'PHOTO_FINISH'
    | 'PROVERB_CORRECT'
    | 'PROVERB_STEAL'
    | 'PROVERB_MISS'
    | 'FAIR_PLAY_BONUS';
  team: TeamId | 'INDIVIDUAL';
  playerName: string;
  points: number;
  reasonEn: string;
  reasonAr: string;
  thumbnailDataUrl: string;
  verified: boolean;
  boxes?: DetectionBox[];
}

export interface ProverbItem {
  id: string;
  firstHalf: string;
  ending: string;
  meaningEn: string;
  category: string;
}

export interface LeaderboardRow {
  playerId: string;
  playerName: string;
  team: TeamId;
  points: number;
  wins: number;
  goals: number;
  bestRaceTime: number;
  correctAnswers: number;
  fairPlayBonusCount: number;
}

export interface CoachTip {
  playerName: string;
  tipEn: string;
  tipAr: string;
}

export interface SavedGameRecord {
  id: string;
  gameType: GameType;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  winner: string;
  mvpName: string;
  mvpReasonEn: string;
  mvpReasonAr: string;
  coachSummaryEn: string;
  coachSummaryAr: string;
  playerTips?: CoachTip[];
  reportHash: string;
  verified: boolean;
  createdAt: string;
  events: AIEventCard[];
  possessionA?: number;
  possessionB?: number;
}

export interface SignedAIReport {
  version: string;
  generator: string;
  timestamp: string;
  gameType: GameType;
  teamAName: string;
  teamBName: string;
  scoreDeltaA: number;
  scoreDeltaB: number;
  mvpName: string;
  mvpReasonEn: string;
  mvpReasonAr: string;
  possessionA?: number;
  possessionB?: number;
  events: AIEventCard[];
  sha256Signature: string;
}
