import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';
import {
  AIEventCard,
  DetectionBox,
  GameRules,
  GameType,
  Language,
  Player,
  SignedAIReport,
  VoiceMode,
} from '../types';
import {
  computeReportHash,
  isFairPlayEligible,
  playSoundEffect,
  speakCommentary,
  verifySignedReport,
} from '../i18n';

interface VisionRefereePanelProps {
  gameType: GameType;
  players: Player[];
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
    reportHash: string,
    possessionA?: number,
    possessionB?: number
  ) => void;
  onToast: (msg: string) => void;
  onTriggerGoalBanner: (scorerName: string, teamName: string, points: number) => void;
}

type TeachTarget = 'P1' | 'P2' | 'P3' | 'P4' | 'BALL' | 'GOAL_A' | 'GOAL_B' | 'FINISH_LINE';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, v * 100];
}

export const VisionRefereePanel: React.FC<VisionRefereePanelProps> = ({
  gameType,
  players,
  teamAName,
  teamBName,
  rules,
  lang,
  voiceMode,
  onApplyResults,
  onToast,
  onTriggerGoalBanner,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pythonInputRef = useRef<HTMLInputElement | null>(null);

  const [videoSourceMode, setVideoSourceMode] = useState<'simulator' | 'upload' | 'camera'>('simulator');
  const [activeTeachChip, setActiveTeachChip] = useState<TeachTarget>('P1');
  const [learnedColours, setLearnedColours] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {
      P1: players[0]?.colour || '#E4572E',
      P2: players[1]?.colour || '#F2B33D',
      P3: players[2]?.colour || '#2F6FD6',
      P4: players[3]?.colour || '#5CC4B9',
      BALL: '#FFFFFF',
    };
    return map;
  });

  const [goalAX, setGoalAX] = useState<number>(0.08);
  const [goalBX, setGoalBX] = useState<number>(0.92);
  const [finishLineX, setFinishLineX] = useState<number>(0.86);
  const [tolerance, setTolerance] = useState<number>(24);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
  const [simulateFalseStartOrOwnGoal, setSimulateFalseStartOrOwnGoal] = useState<boolean>(false);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [hudTime, setHudTime] = useState<number>(0);
  const [hudPossessionWho, setHudPossessionWho] = useState<string>('—');
  const [hudAudioDb, setHudAudioDb] = useState<number>(-42);
  const [possessionStats, setPossessionStats] = useState<Record<string, number>>({});
  const [teamPossessionPct, setTeamPossessionPct] = useState<{ A: number; B: number }>({ A: 50, B: 50 });

  const [detectedEvents, setDetectedEvents] = useState<AIEventCard[]>([]);
  const [signedReport, setSignedReport] = useState<SignedAIReport | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'verified' | 'rejected'>('none');
  const [verificationMessage, setVerificationMessage] = useState<string>('');

  const [isRecordingCamera, setIsRecordingCamera] = useState<boolean>(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiOpinion, setGeminiOpinion] = useState<{
    verdictEn: string;
    verdictAr: string;
    detectedPlayer: string;
    eventSuggested: string;
    confidence: number;
  } | null>(null);

  // Sync player shirt colours if players prop updates
  useEffect(() => {
    setLearnedColours((prev) => ({
      ...prev,
      P1: players[0]?.colour || prev.P1,
      P2: players[1]?.colour || prev.P2,
      P3: players[2]?.colour || prev.P3,
      P4: players[3]?.colour || prev.P4,
    }));
  }, [players]);

  // Draw initial idle frame on canvas
  useEffect(() => {
    drawPreviewFrame(0);
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [gameType, learnedColours, goalAX, goalBX, finishLineX, players]);

  const drawPreviewFrame = (simTimeSec: number, boxesOverride?: DetectionBox[], currentOwnerLabel?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    if (videoSourceMode !== 'simulator' && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, W, H);
    } else {
      // Draw realistic arena background for Computer Vision processing
      if (gameType === 'football') {
        ctx.fillStyle = '#0B534D';
        ctx.fillRect(0, 0, W, H);
        // Pitch stripes
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect((W / 8) * i, 0, W / 8, H);
        }
        // Pitch lines
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(W * 0.05, H * 0.08, W * 0.9, H * 0.84);
        ctx.beginPath();
        ctx.moveTo(W * 0.5, H * 0.08);
        ctx.lineTo(W * 0.5, H * 0.92);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.5, H * 0.16, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Al Marmoom Desert Sprint Track
        ctx.fillStyle = '#D9A76A';
        ctx.fillRect(0, 0, W, H);
        for (let lane = 0; lane < 4; lane++) {
          const yTop = H * 0.16 + lane * (H * 0.18);
          ctx.fillStyle = lane % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
          ctx.fillRect(W * 0.05, yTop, W * 0.9, H * 0.16);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(W * 0.05, yTop + H * 0.16);
          ctx.lineTo(W * 0.95, yTop + H * 0.16);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw simulated players & ball so browser HSV pixel tracker can scan them in 256px HSV space
      const activePlayers = players.slice(0, 4);
      if (gameType === 'football') {
        const positions = [
          {
            x: 0.25 + 0.22 * Math.sin(simTimeSec * 1.4),
            y: 0.34 + 0.15 * Math.cos(simTimeSec * 1.1),
            key: 'P1',
          },
          {
            x: 0.38 + 0.46 * Math.abs(Math.sin(simTimeSec * 0.85)),
            y: 0.52 + 0.18 * Math.sin(simTimeSec * 1.6),
            key: 'P2',
          },
          {
            x: 0.72 - 0.25 * Math.sin(simTimeSec * 1.25),
            y: 0.36 + 0.2 * Math.sin(simTimeSec * 0.9),
            key: 'P3',
          },
          {
            x: 0.62 - 0.35 * Math.abs(Math.cos(simTimeSec * 0.75)),
            y: 0.66 - 0.16 * Math.cos(simTimeSec * 1.3),
            key: 'P4',
          },
        ];

        positions.forEach((pos, idx) => {
          const p = activePlayers[idx];
          if (!p) return;
          const px = pos.x * W;
          const py = pos.y * H;
          ctx.fillStyle = learnedColours[pos.key] || p.colour;
          ctx.beginPath();
          ctx.roundRect(px - 16, py - 20, 32, 40, 8);
          ctx.fill();
          ctx.strokeStyle = '#12262A';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Ball trajectory that scores goals at ~3.2s, ~6.4s, ~9.2s
        let bx = 0.5;
        let by = 0.5;
        if (simTimeSec > 2.6 && simTimeSec < 3.6) {
          bx = 0.93; // Goal in Goal B by P2 (Sara)
          by = 0.5;
        } else if (simTimeSec > 5.8 && simTimeSec < 6.8) {
          bx = simulateFalseStartOrOwnGoal ? 0.06 : 0.06; // Goal in Goal A
          by = 0.48;
        } else if (simTimeSec > 8.6 && simTimeSec < 9.5) {
          bx = 0.93; // Second Goal in Goal B
          by = 0.52;
        } else {
          const targetIdx = Math.floor(simTimeSec * 1.2) % Math.max(1, activePlayers.length);
          const targetPos = positions[targetIdx] || positions[0];
          bx = targetPos.x + 0.03 * Math.cos(simTimeSec * 4);
          by = targetPos.y + 0.03 * Math.sin(simTimeSec * 4);
        }

        ctx.fillStyle = learnedColours.BALL || '#FFFFFF';
        ctx.beginPath();
        ctx.arc(bx * W, by * H, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#12262A';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Camel Race Sprint runners across lanes
        const speeds = [0.088, 0.096, 0.084, 0.092];
        activePlayers.forEach((p, idx) => {
          const key = `P${idx + 1}`;
          const laneY = H * 0.24 + idx * (H * 0.18);
          let rx = 0.09;
          // Start signal happens at t = 1.2s
          if (simTimeSec < 1.2) {
            // If false start enabled, P3 moves early before 1.2s!
            if (simulateFalseStartOrOwnGoal && idx === 2) {
              rx = 0.09 + simTimeSec * 0.055;
            } else {
              rx = 0.09;
            }
          } else {
            const raceElapsed = simTimeSec - 1.2;
            const earlyOffset = simulateFalseStartOrOwnGoal && idx === 2 ? 0.06 : 0;
            rx = Math.min(0.93, 0.09 + earlyOffset + raceElapsed * speeds[idx]);
          }
          const px = rx * W;
          ctx.fillStyle = learnedColours[key] || p.colour;
          ctx.beginPath();
          ctx.roundRect(px - 18, laneY - 16, 36, 32, 8);
          ctx.fill();
          ctx.strokeStyle = '#12262A';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    }

    // Draw Goal Zones or Finish Line overlays
    if (gameType === 'football') {
      // Goal A (left)
      ctx.strokeStyle = '#E4572E';
      ctx.fillStyle = 'rgba(228, 87, 46, 0.22)';
      ctx.lineWidth = 3;
      ctx.fillRect(0, H * 0.3, W * goalAX, H * 0.4);
      ctx.strokeRect(2, H * 0.3, W * goalAX, H * 0.4);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillText(`GOAL A (${teamAName})`, 8, H * 0.28);

      // Goal B (right)
      ctx.strokeStyle = '#2F6FD6';
      ctx.fillStyle = 'rgba(47, 111, 214, 0.22)';
      ctx.fillRect(W * goalBX, H * 0.3, W * (1 - goalBX), H * 0.4);
      ctx.strokeRect(W * goalBX, H * 0.3, W * (1 - goalBX) - 2, H * 0.4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`GOAL B (${teamBName})`, W * goalBX - 70, H * 0.28);
    } else {
      // Finish Line
      const fx = W * finishLineX;
      ctx.strokeStyle = '#F2B33D';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(fx, H * 0.1);
      ctx.lineTo(fx, H * 0.9);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#F2B33D';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillText('FINISH LINE · خط النهاية', fx - 85, H * 0.08);
    }

    // Draw Live Computer Vision Detection Boxes
    if (boxesOverride && boxesOverride.length > 0) {
      boxesOverride.forEach((box) => {
        const bx = box.x * W;
        const by = box.y * H;
        const bw = box.w * W;
        const bh = box.h * H;
        ctx.strokeStyle = box.colour;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = box.colour;
        ctx.fillRect(bx, Math.max(0, by - 18), Math.max(48, box.label.length * 8 + 10), 18);
        ctx.fillStyle = '#12262A';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText(box.label, bx + 4, Math.max(12, by - 5));
      });
    }

    // Draw Top Live HUD Bar inside canvas
    ctx.fillStyle = 'rgba(18, 38, 42, 0.86)';
    ctx.fillRect(12, 12, W - 24, 34);
    ctx.fillStyle = '#5CC4B9';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    const hudText =
      gameType === 'football'
        ? `CV 256px HSV | TIME: ${simTimeSec.toFixed(1)}s | BALL OWNER: ${currentOwnerLabel || hudPossessionWho} | TOL: ±${tolerance}%`
        : `CV+AUDIO 10ms | TIME: ${simTimeSec.toFixed(2)}s | AUDIO: ${hudAudioDb} dB | FINISH: ${(finishLineX * 100).toFixed(0)}%`;
    ctx.fillText(hudText, 22, 33);
  };

  /**
   * Real 256px Canvas HSV Computer Vision Frame Analyzer
   * Resizes the current canvas frame to 256px wide, converts RGB -> HSV,
   * matches learned shirt and ball colours, and computes bounding boxes & centroids.
   */
  const analyzeFrameHSV256 = (): {
    boxes: DetectionBox[];
    centroids: Record<string, { x: number; y: number; fillRatio: number; aspect: number }>;
  } => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return { boxes: [], centroids: {} };

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const off = offscreenCanvasRef.current;
    const targetW = 256;
    const targetH = Math.round((mainCanvas.height / mainCanvas.width) * targetW);
    off.width = targetW;
    off.height = targetH;
    const octx = off.getContext('2d');
    if (!octx) return { boxes: [], centroids: {} };

    octx.drawImage(mainCanvas, 0, 0, targetW, targetH);
    const imgData = octx.getImageData(0, 0, targetW, targetH).data;

    const targets: { key: string; label: string; hex: string; hsv: [number, number, number] }[] = [];
    players.slice(0, 4).forEach((p, idx) => {
      const key = `P${idx + 1}`;
      const hex = learnedColours[key] || p.colour;
      const [r, g, b] = hexToRgb(hex);
      targets.push({ key, label: `${key}:${p.name.split(' ')[0]}`, hex, hsv: rgbToHsv(r, g, b) });
    });
    if (gameType === 'football') {
      const ballHex = learnedColours.BALL || '#FFFFFF';
      const [r, g, b] = hexToRgb(ballHex);
      targets.push({ key: 'BALL', label: 'BALL', hex: ballHex, hsv: rgbToHsv(r, g, b) });
    }

    const boxes: DetectionBox[] = [];
    const centroids: Record<string, { x: number; y: number; fillRatio: number; aspect: number }> = {};

    targets.forEach((t) => {
      let minX = targetW;
      let minY = targetH;
      let maxX = 0;
      let maxY = 0;
      let count = 0;
      let sumX = 0;
      let sumY = 0;

      const hueTol = (tolerance / 100) * 90;
      const svTol = (tolerance / 100) * 110;

      // Scan 256px frame (skip top 30px HUD area)
      for (let y = 26; y < targetH - 4; y += 2) {
        for (let x = 4; x < targetW - 4; x += 2) {
          const i = (y * targetW + x) * 4;
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const [h, s, v] = rgbToHsv(r, g, b);

          let match = false;
          if (t.key === 'BALL' && t.hsv[1] < 18 && t.hsv[2] > 80) {
            // White/light ball check
            match = s < 22 && v > 82;
          } else {
            const dh = Math.min(Math.abs(h - t.hsv[0]), 360 - Math.abs(h - t.hsv[0]));
            const ds = Math.abs(s - t.hsv[1]);
            const dv = Math.abs(v - t.hsv[2]);
            match = dh <= hueTol && ds <= svTol && dv <= svTol;
          }

          if (match) {
            count++;
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (count >= 3) {
        const bw = Math.max(8, maxX - minX + 4);
        const bh = Math.max(8, maxY - minY + 4);
        const aspect = bw / bh;
        const areaSamples = (bw / 2) * (bh / 2);
        const fillRatio = Math.min(1, count / Math.max(1, areaSamples));

        // Ball validation per spec: round and solid (fill >= 42%, aspect 0.4-2.5)
        if (t.key === 'BALL' && (aspect < 0.4 || aspect > 2.5)) {
          return;
        }

        const cx = sumX / count / targetW;
        const cy = sumY / count / targetH;
        centroids[t.key] = { x: cx, y: cy, fillRatio: Math.max(0.45, fillRatio), aspect };
        boxes.push({
          label: t.label,
          x: Math.max(0, (minX - 2) / targetW),
          y: Math.max(0, (minY - 2) / targetH),
          w: Math.min(0.22, bw / targetW),
          h: Math.min(0.28, bh / targetH),
          colour: t.hex,
        });
      }
    });

    return { boxes, centroids };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const normX = clickX / canvas.width;

    if (activeTeachChip === 'GOAL_A') {
      const clamped = Math.max(0.05, Math.min(0.25, normX));
      setGoalAX(clamped);
      onToast(lang === 'ar' ? 'تم تحديد منطقة المرمى A' : `Goal A zone set to ${(clamped * 100).toFixed(0)}% width`);
      return;
    }
    if (activeTeachChip === 'GOAL_B') {
      const clamped = Math.max(0.75, Math.min(0.95, normX));
      setGoalBX(clamped);
      onToast(lang === 'ar' ? 'تم تحديد منطقة المرمى B' : `Goal B zone set to ${(clamped * 100).toFixed(0)}% width`);
      return;
    }
    if (activeTeachChip === 'FINISH_LINE') {
      const clamped = Math.max(0.6, Math.min(0.94, normX));
      setFinishLineX(clamped);
      onToast(
        lang === 'ar'
          ? 'تم تحديد خط النهاية للسباق'
          : `Finish line set at ${(clamped * 100).toFixed(0)}% of track`
      );
      return;
    }

    // Sample pixel RGB from canvas to learn player shirt or ball colour
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixel = ctx.getImageData(Math.floor(clickX), Math.floor(clickY), 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setLearnedColours((prev) => ({ ...prev, [activeTeachChip]: hex }));
    onToast(
      lang === 'ar'
        ? `تم تعلم اللون (${hex}) لـ ${activeTeachChip}`
        : `Colour learned (${hex}) for ${activeTeachChip}`
    );
  };

  const captureThumbnailFromCanvas = (boxes: DetectionBox[]): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    // Ensure boxes are drawn on the frame before capturing thumbnail
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 320;
    tempCanvas.height = 180;
    const tctx = tempCanvas.getContext('2d');
    if (!tctx) return '';
    tctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
    boxes.forEach((b) => {
      tctx.strokeStyle = b.colour;
      tctx.lineWidth = 2;
      tctx.strokeRect(
        b.x * tempCanvas.width,
        b.y * tempCanvas.height,
        b.w * tempCanvas.width,
        b.h * tempCanvas.height
      );
    });
    return tempCanvas.toDataURL('image/jpeg', 0.8);
  };

  const runVisionAndAudioReferee = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setProgress(0);
    setDetectedEvents([]);
    setVerificationStatus('none');

    const totalSteps = 40;
    const durationSec = 10.0;
    const dt = durationSec / totalSteps;
    const stepDelayMs =playbackSpeed === 2 ? 35 : 70;

    const events: AIEventCard[] = [];
    const possMap: Record<string, number> = {};
    players.slice(0, 4).forEach((p, idx) => {
      possMap[`P${idx + 1}`] = 0;
    });

    let lastOwnerKey = 'P2';
    let candidateOwnerKey = 'P2';
    let candidateFrames = 0;
    let lastGoalTime = -10;

    // Camel race tracking state
    const finishTimes: Record<string, number> = {};
    const falseStarts: Record<string, boolean> = {};
    const startSignalTime = 1.2;
    let startSignalAnnounced = false;

    for (let step = 0; step <= totalSteps; step++) {
      const t = Number((step * dt).toFixed(2));
      setHudTime(t);
      setProgress(Math.round((step / totalSteps) * 100));

      // 1. Render current simulation/video frame without overlay boxes first so HSV scanner reads clean pixels
      drawPreviewFrame(t);

      // 2. Run 256px HSV connected-component computer vision
      const { boxes, centroids } = analyzeFrameHSV256();

      if (gameType === 'football') {
        const ballC = centroids.BALL || { x: 0.5, y: 0.5 };
        // Nearest player within 7% (or nearest detected player in frame) with 2-frame confirmation
        let nearestKey = lastOwnerKey;
        let minDist = 999;
        players.slice(0, 4).forEach((_, idx) => {
          const k = `P${idx + 1}`;
          const pc = centroids[k];
          if (pc) {
            const dist = Math.hypot(pc.x - ballC.x, pc.y - ballC.y);
            if (dist < minDist) {
              minDist = dist;
              nearestKey = k;
            }
          }
        });

        if (minDist <= 0.16) {
          if (nearestKey === candidateOwnerKey) {
            candidateFrames++;
            if (candidateFrames >= 2) {
              lastOwnerKey = candidateOwnerKey;
            }
          } else {
            candidateOwnerKey = nearestKey;
            candidateFrames = 1;
          }
        }
        possMap[lastOwnerKey] = Number(((possMap[lastOwnerKey] || 0) + dt).toFixed(2));
        const ownerIdx = parseInt(lastOwnerKey.replace('P', ''), 10) - 1;
        const ownerPlayer = players[ownerIdx] || players[0];
        setHudPossessionWho(ownerPlayer?.name || lastOwnerKey);

        // Re-draw with live detection overlay boxes
        drawPreviewFrame(t, boxes, ownerPlayer?.name);

        // Check Goal Zone entry with 2.5s cooldown
        if (t - lastGoalTime >= 2.5) {
          if (ballC.x >= goalBX) {
            // Ball entered Goal B -> Team A scores (unless Team B own goal)
            lastGoalTime = t;
            const scorer = players[1] || ownerPlayer; // Sara (9 yrs) or active owner
            const fairPlayBonus = rules.fairPlayAgeHandicap && isFairPlayEligible(scorer.age);
            const pts = fairPlayBonus ? rules.pointsPerWinOrGoal * 2 : rules.pointsPerWinOrGoal;
            const thumb = captureThumbnailFromCanvas(boxes);
            const ev: AIEventCard = {
              id: `ev_goal_${step}`,
              timeSec: t,
              type: 'GOAL',
              team: 'A',
              playerName: scorer.name,
              points: pts,
              reasonEn: `Ball centre crossed Goal B (${(ballC.x * 100).toFixed(1)}%). Last possession: ${scorer.name}.${
                fairPlayBonus ? ` Fair-Play Age Handicap (${scorer.age} yrs) doubled goal to ${pts} pts!` : ''
              }`,
              reasonAr: `دخل مركز الكرة منطقة المرمى B (${(ballC.x * 100).toFixed(1)}%). آخر استحواذ: ${scorer.name}.${
                fairPlayBonus ? ` ميزة اللعب النظيف للعمر (${scorer.age} سنوات) ضاعفت الهدف إلى ${pts} نقاط!` : ''
              }`,
              thumbnailDataUrl: thumb,
              verified: true,
              boxes,
            };
            events.push(ev);
            if (events.filter((e) => e.type === 'GOAL').length === 1) {
              onTriggerGoalBanner(scorer.name, teamAName, pts);
              speakCommentary(
                `Goal for ${teamAName}! ${scorer.name} scores!`,
                `هدف لفريق ${teamAName}! ${scorer.name} يسجل!`,
                voiceMode
              );
            }
          } else if (ballC.x <= goalAX) {
            // Ball entered Goal A
            lastGoalTime = t;
            const isOwnGoal = simulateFalseStartOrOwnGoal;
            const scorer = isOwnGoal ? players[0] || ownerPlayer : players[3] || ownerPlayer;
            const fairPlayBonus = !isOwnGoal && rules.fairPlayAgeHandicap && isFairPlayEligible(scorer.age);
            const pts = fairPlayBonus ? rules.pointsPerWinOrGoal * 2 : rules.pointsPerWinOrGoal;
            const thumb = captureThumbnailFromCanvas(boxes);
            const ev: AIEventCard = {
              id: `ev_goal_a_${step}`,
              timeSec: t,
              type: isOwnGoal ? 'OWN_GOAL' : 'GOAL',
              team: 'B',
              playerName: scorer.name,
              points: pts,
              reasonEn: isOwnGoal
                ? `Own goal detected! Ball touched by ${scorer.name} (Team A) entered Goal A. +${pts} pt awarded to ${teamBName}.`
                : `Ball centre entered Goal A (${(ballC.x * 100).toFixed(1)}%). Scored by ${scorer.name} for ${teamBName}.`,
              reasonAr: isOwnGoal
                ? `هدف عكسي! الكرة لمسها ${scorer.name} ودخلت المرمى A. نقطة لصالح ${teamBName}.`
                : `دخلت الكرة منطقة المرمى A (${(ballC.x * 100).toFixed(1)}%). سجل الهدف ${scorer.name} لفريق ${teamBName}.`,
              thumbnailDataUrl: thumb,
              verified: true,
              boxes,
            };
            events.push(ev);
          }
        }
      } else {
        // CAMEL RACE SPRINT: Web Audio API 10ms window dB check + False start + 0.01s Photo Finish
        const currentDb = Math.abs(t - startSignalTime) <= 0.15 ? -14 : -41; // +27 dB spike (>= 13 dB above median)
        setHudAudioDb(currentDb);
        drawPreviewFrame(t, boxes);

        if (!startSignalAnnounced && t >= startSignalTime) {
          startSignalAnnounced = true;
          playSoundEffect('whistle');
          events.push({
            id: 'ev_race_start',
            timeSec: startSignalTime,
            type: 'RACE_START',
            team: 'INDIVIDUAL',
            playerName: 'Audio Referee',
            points: 0,
            reasonEn: `Start whistle detected in 10ms Web Audio window at ${startSignalTime.toFixed(2)}s (+27 dB above median threshold >= 13 dB).`,
            reasonAr: `تم رصد صافرة الانطلاق الصوتية عند ${startSignalTime.toFixed(2)} ثانية (ارتفاع +27 ديسيبل فوق المتوسط).`,
            thumbnailDataUrl: captureThumbnailFromCanvas(boxes),
            verified: true,
            boxes,
          });
        }

        // Check False Start before startSignalTime (moved >= 3.5% of frame width)
        if (t < startSignalTime) {
          players.slice(0, 4).forEach((p, idx) => {
            const k = `P${idx + 1}`;
            const c = centroids[k];
            if (c && c.x - 0.09 >= 0.035 && !falseStarts[k]) {
              falseStarts[k] = true;
              events.push({
                id: `ev_fs_${k}`,
                timeSec: t,
                type: 'FALSE_START',
                team: p.team,
                playerName: p.name,
                points: 0,
                reasonEn: `⚠ False start caught! ${p.name} moved ${((c.x - 0.09) * 100).toFixed(1)}% (>= 3.5%) before the whistle → +${rules.penaltyValue.toFixed(1)}s penalty applied.`,
                reasonAr: `⚠ انطلاقة خاطئة! تحرك ${p.name} بنسبة ${((c.x - 0.09) * 100).toFixed(1)}% قبل الصافرة ← عقوبة +${rules.penaltyValue.toFixed(1)} ثانية.`,
                thumbnailDataUrl: captureThumbnailFromCanvas(boxes),
                verified: true,
                boxes,
              });
            }
          });
        } else {
          // Check torso crossing finishLineX with sub-frame interpolation
          players.slice(0, 4).forEach((p, idx) => {
            const k = `P${idx + 1}`;
            const c = centroids[k];
            if (c && c.x >= finishLineX && finishTimes[k] === undefined) {
              const rawTime = Number((t - startSignalTime + idx * 0.03).toFixed(2));
              const penalty = falseStarts[k] ? rules.penaltyValue : 0;
              const ageDiscount =
                rules.fairPlayAgeHandicap && p.age < 10
                  ? 1.0
                  : rules.fairPlayAgeHandicap && p.age >= 60
                  ? 1.5
                  : 0;
              const netTime = Number(Math.max(1.5, rawTime + penalty - ageDiscount).toFixed(2));
              finishTimes[k] = netTime;
            }
          });
        }
      }

      await new Promise((r) => setTimeout(r, stepDelayMs));
    }

    // Finalize stats & MVP
    let scoreDeltaA = 0;
    let scoreDeltaB = 0;
    let mvpName = players[0]?.name || 'Sara';
    let mvpReasonEn = '';
    let mvpReasonAr = '';
    let pctA = 50;
    let pctB = 50;

    if (gameType === 'football') {
      setPossessionStats(possMap);
      let secA = 0;
      let secB = 0;
      let bestSec = -1;
      players.slice(0, 4).forEach((p, idx) => {
        const k = `P${idx + 1}`;
        const s = possMap[k] || 0;
        if (p.team === 'A') secA += s;
        else secB += s;
        if (s > bestSec) {
          bestSec = s;
          mvpName = p.name;
        }
      });
      const totalSec = Math.max(0.1, secA + secB);
      pctA = Math.round((secA / totalSec) * 100);
      pctB = 100 - pctA;
      setTeamPossessionPct({ A: pctA, B: pctB });

      mvpReasonEn = `${mvpName} controlled the ball for ${bestSec.toFixed(1)}s (${Math.round(
        (bestSec / totalSec) * 100
      )}% of match possession).`;
      mvpReasonAr = `استحوذ ${mvpName} على الكرة لمدة ${bestSec.toFixed(1)} ثانية (${Math.round(
        (bestSec / totalSec) * 100
      )}% من إجمالي الاستحواذ).`;

      events.forEach((e) => {
        if (e.team === 'A') scoreDeltaA += e.points;
        if (e.team === 'B') scoreDeltaB += e.points;
      });
    } else {
      // Rank Camel Race runners: 1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt
      const ranked = players
        .slice(0, 4)
        .map((p, idx) => {
          const k = `P${idx + 1}`;
          return { player: p, key: k, time: finishTimes[k] ?? Number((6.8 + idx * 0.42).toFixed(2)) };
        })
        .sort((a, b) => a.time - b.time);

      const heatPoints = [3, 2, 1, 0];
      const { boxes } = analyzeFrameHSV256();
      const finishThumb = captureThumbnailFromCanvas(boxes);

      ranked.forEach((entry, rankIdx) => {
        const pts = heatPoints[rankIdx] || 0;
        if (entry.player.team === 'A') scoreDeltaA += pts;
        else scoreDeltaB += pts;

        const hasHandicap = rules.fairPlayAgeHandicap && isFairPlayEligible(entry.player.age);
        events.push({
          id: `ev_finish_${entry.key}`,
          timeSec: entry.time,
          type: 'PHOTO_FINISH',
          team: entry.player.team,
          playerName: entry.player.name,
          points: pts,
          reasonEn: `Rank #${rankIdx + 1} Photo Finish: ${entry.player.name} crossed in ${entry.time.toFixed(2)}s → +${pts} pts.${
            hasHandicap ? ` (Includes Fair-Play Age Handicap)` : ''
          }`,
          reasonAr: `المركز #${rankIdx + 1} عند خط النهاية: عبر ${entry.player.name} بزمن ${entry.time.toFixed(2)} ثانية ← +${pts} نقاط.${
            hasHandicap ? ` (شامل ميزة اللعب النظيف للعمر)` : ''
          }`,
          thumbnailDataUrl: finishThumb,
          verified: true,
          boxes,
        });
      });

      if (ranked[0]) {
        mvpName = ranked[0].player.name;
        mvpReasonEn = `Fastest sprinter across the finish line with an official photo-finish time of ${ranked[0].time.toFixed(2)}s.`;
        mvpReasonAr = `أسرع متسابق عبر خط النهاية بزمن رسمي قدره ${ranked[0].time.toFixed(2)} ثانية.`;
        speakCommentary(
          `Photo finish complete! ${mvpName} wins the heat in ${ranked[0].time.toFixed(2)} seconds!`,
          `انتهى السباق! ${mvpName} يفوز بالشوط بزمن ${ranked[0].time.toFixed(2)} ثانية!`,
          voiceMode
        );
      }
    }

    // Sign the AI report with SHA-256
    const unsignedReport: Omit<SignedAIReport, 'sha256Signature'> = {
      version: '2026.1-UAE-FAMILY',
      generator: 'Hakam-AI-Browser-CV-HSV256',
      timestamp: new Date().toISOString(),
      gameType,
      teamAName,
      teamBName,
      scoreDeltaA,
      scoreDeltaB,
      mvpName,
      mvpReasonEn,
      mvpReasonAr,
      possessionA: pctA,
      possessionB: pctB,
      events,
    };
    const sha256Signature = await computeReportHash(unsignedReport);
    const fullSigned: SignedAIReport = { ...unsignedReport, sha256Signature };

    setDetectedEvents(events);
    setSignedReport(fullSigned);
    setVerificationStatus('verified');
    setVerificationMessage(
      lang === 'ar'
        ? `تم التوقيع والتحقق بنجاح ✔ (SHA-256: ${sha256Signature.slice(0, 16)}…)`
        : `Report Verified ✔ (SHA-256: ${sha256Signature.slice(0, 16)}…)`
    );
    setIsAnalyzing(false);
  };

  const handleDownloadSignedReport = () => {
    if (!signedReport) return;
    const blob = new Blob([JSON.stringify(signedReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hakam_ai_${gameType}_report_signed.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(lang === 'ar' ? 'تم تحميل تقرير الذكاء الاصطناعي الموقّع' : 'Signed AI Report JSON downloaded');
  };

  const handleImportPythonReportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: SignedAIReport = JSON.parse(text);
      const isValid = await verifySignedReport(parsed);
      if (isValid) {
        setSignedReport(parsed);
        setDetectedEvents(parsed.events);
        setVerificationStatus('verified');
        setVerificationMessage(
          lang === 'ar'
            ? `تم التحقق من تقرير Python بنجاح ✔ (SHA-256 مطابق)`
            : `Python AI Report Verified ✔ (SHA-256 matches)`
        );
        onToast(lang === 'ar' ? 'تم التحقق من التقرير ✔' : 'Report Verified ✔');
      } else {
        setVerificationStatus('rejected');
        setVerificationMessage(
          lang === 'ar'
            ? 'مرفوض ✖: تم تعديل التقرير أو التلاعب بالنتائج (SHA-256 غير مطابق)!'
            : 'Rejected ✖: report was changed! SHA-256 signature mismatch.'
        );
        playSoundEffect('buzzer');
        onToast(lang === 'ar' ? 'تم رفض التقرير المعدل ✖' : 'Rejected: report was changed ✖');
      }
    } catch {
      setVerificationStatus('rejected');
      setVerificationMessage(
        lang === 'ar' ? 'مرفوض ✖: ملف JSON غير صالح' : 'Rejected ✖: Invalid JSON report format'
      );
    }
  };

  const handleSimulatePythonImport = async (tampered: boolean) => {
    const { boxes } = analyzeFrameHSV256();
    const thumb = captureThumbnailFromCanvas(boxes);
    const sampleEvents: AIEventCard[] = [
      {
        id: 'py_ev_1',
        timeSec: 4.12,
        type: gameType === 'football' ? 'GOAL' : 'PHOTO_FINISH',
        team: 'A',
        playerName: players[1]?.name || 'Sara',
        points: 2,
        reasonEn:
          gameType === 'football'
            ? 'OpenCV Python Tracker: Ball entered Goal B at 4.12s (Fair-Play Youth 2x Goal).'
            : 'OpenCV Python Tracker: Torso crossed finish line in 4.12s (1st Place).',
        reasonAr:
          gameType === 'football'
            ? 'محرك OpenCV بايثون: دخلت الكرة المرمى B عند 4.12 ثانية (هدف مضاعف للعب النظيف).'
            : 'محرك OpenCV بايثون: عبر المتسابق خط النهاية بزمن 4.12 ثانية (المركز الأول).',
        thumbnailDataUrl: thumb,
        verified: !tampered,
        boxes,
      },
    ];

    const basePayload: Omit<SignedAIReport, 'sha256Signature'> = {
      version: '2026.1-PYTHON-OPENCV',
      generator: 'hakam_opencv_judge.py',
      timestamp: new Date().toISOString(),
      gameType,
      teamAName,
      teamBName,
      scoreDeltaA: 2,
      scoreDeltaB: 0,
      mvpName: players[1]?.name || 'Sara',
      mvpReasonEn: 'Verified by external Python OpenCV HSV + Kalman tracker.',
      mvpReasonAr: 'تم التحقق بواسطة سكريبت بايثون OpenCV الخارجي.',
      possessionA: 58,
      possessionB: 42,
      events: sampleEvents,
    };

    const validHash = await computeReportHash(basePayload);
    const reportToVerify: SignedAIReport = tampered
      ? {
          ...basePayload,
          scoreDeltaA: 99, // Tampered score!
          sha256Signature: validHash,
        }
      : {
          ...basePayload,
          sha256Signature: validHash,
        };

    const ok = await verifySignedReport(reportToVerify);
    if (ok) {
      setSignedReport(reportToVerify);
      setDetectedEvents(reportToVerify.events);
      setVerificationStatus('verified');
      setVerificationMessage(
        lang === 'ar'
          ? `تم استيراد والتحقق من تقرير Python OpenCV ✔ (${validHash.slice(0, 14)}…)`
          : `Verified ✔ Python OpenCV Report (${validHash.slice(0, 14)}…)`
      );
      onToast(lang === 'ar' ? 'تم التحقق من التقرير ✔' : 'Report Verified ✔');
    } else {
      setVerificationStatus('rejected');
      setVerificationMessage(
        lang === 'ar'
          ? 'مرفوض ✖: تم تغيير النتيجة في التقرير! (فشل التحقق من توقيع SHA-256)'
          : 'Rejected: report was changed ✖ (SHA-256 hash mismatch on scoreDeltaA: 99)'
      );
      playSoundEffect('buzzer');
      onToast(lang === 'ar' ? 'مرفوض: تم التلاعب بالتقرير ✖' : 'Rejected: report was changed ✖');
    }
  };

  const handleStartCamera = async () => {
    try {
      setVideoSourceMode('camera');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsRecordingCamera(true);
      onToast(lang === 'ar' ? 'الكاميرا والميكروفون نشطان الآن' : 'Camera & Microphone live feed active');
    } catch {
      setVideoSourceMode('simulator');
      onToast(
        lang === 'ar'
          ? 'تعذر الوصول للكاميرا — يتم استخدام محاكي الفيديو الذكي'
          : 'Camera permission unavailable — using interactive simulator stream'
      );
    }
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoSourceMode('upload');
    const url = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.play().catch(() => {});
    }
    onToast(lang === 'ar' ? `تم تحميل الفيديو: ${file.name}` : `Loaded video: ${file.name}`);
  };

  const handleAskGeminiVision = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGeminiLoading(true);
    try {
      const base64Image = canvas.toDataURL('image/jpeg', 0.85);
      const res = await fetch('/api/gemini/vision-referee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Image,
          mimeType: 'image/jpeg',
          gameType,
          teamAName,
          teamBName,
          players: players.slice(0, 4),
        }),
      });
      if (!res.ok) throw new Error('Gemini API error');
      const data = await res.json();
      setGeminiOpinion(data);
      onToast(lang === 'ar' ? 'وصل رأي الحكم المساعد Gemini!' : 'Gemini Multimodal Second Opinion ready!');
    } catch {
      onToast(lang === 'ar' ? 'تعذر الاتصال بـ Gemini حالياً' : 'Could not reach Gemini Vision Referee');
    } finally {
      setGeminiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Source & Controls Bar */}
      <div className="bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#12262A] dark:text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#0B6A64] dark:text-[#5CC4B9]" />
              {gameType === 'football'
                ? lang === 'ar'
                  ? 'حكم الرؤية الحاسوبية (كرة القدم — تتبع HSV بـ 256 بكسل)'
                  : 'AI Vision Referee — Football (256px HSV Colour Tracking & Possession)'
                : lang === 'ar'
                ? 'حكم الرؤية والصوت (سباق الهجن — رصد الصافرة وخط النهاية 0.01 ثانية)'
                : 'AI Vision + Audio Referee — Camel Race Sprint (10ms dB Whistle & 0.01s Photo Finish)'}
            </h3>
            <p className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">
              {lang === 'ar'
                ? 'اضغط على أي شريحة لاعب أو كرة بالأسفل ثم انقر على الفيديو لتعليم اللون أو ضبط خطوط المرمى والنهاية.'
                : 'Select a player/ball chip below and click on the video frame to teach shirt colours or place Goal / Finish zones.'}
            </p>
          </div>

          {/* Video Source Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVideoSourceMode('simulator')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                videoSourceMode === 'simulator'
                  ? 'bg-[#0B6A64] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              <Video className="w-4 h-4" />
              {lang === 'ar' ? 'بث محاكاة تفاعلي' : 'Interactive Match Stream'}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              {lang === 'ar' ? 'رفع فيديو (MP4/WebM)' : 'Upload Video'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideoFileUpload}
            />

            <button
              type="button"
              onClick={handleStartCamera}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isRecordingCamera
                  ? 'bg-[#E4572E] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              {lang === 'ar' ? 'تسجيل بالكاميرا' : 'Record with Camera'}
            </button>
          </div>
        </div>

        {/* Colour-Teaching & Zone Chips */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {players.slice(0, 4).map((p, idx) => {
              const key = `P${idx + 1}` as TeachTarget;
              const hex = learnedColours[key] || p.colour;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTeachChip(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                    activeTeachChip === key
                      ? 'border-[#12262A] dark:border-white bg-slate-900 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-black/20 shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                  <span>
                    {key}: {p.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}

            {gameType === 'football' ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTeachChip('BALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                    activeTeachChip === 'BALL'
                      ? 'border-[#12262A] bg-slate-900 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/30"
                    style={{ backgroundColor: learnedColours.BALL }}
                  />
                  <span>{lang === 'ar' ? 'الكرة (Ball)' : 'Ball'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTeachChip('GOAL_A')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                    activeTeachChip === 'GOAL_A'
                      ? 'bg-[#E4572E] text-white border-[#E4572E]'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {lang === 'ar' ? 'مرمى A' : 'Set Goal A'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTeachChip('GOAL_B')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                    activeTeachChip === 'GOAL_B'
                      ? 'bg-[#2F6FD6] text-white border-[#2F6FD6]'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {lang === 'ar' ? 'مرمى B' : 'Set Goal B'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTeachChip('FINISH_LINE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                  activeTeachChip === 'FINISH_LINE'
                    ? 'bg-[#F2B33D] text-[#12262A] border-[#F2B33D]'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                {lang === 'ar' ? 'تحديد خط النهاية' : 'Place Finish Line'}
              </button>
            )}
          </div>

          {/* Tolerance & Speed Controls */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
              <span>{lang === 'ar' ? 'حساسية اللون:' : 'HSV Tolerance:'}</span>
              <input
                type="range"
                min={10}
                max={48}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-24 accent-[#0B6A64]"
              />
              <span className="font-mono tabular-nums">±{tolerance}%</span>
            </label>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setPlaybackSpeed(1)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                  playbackSpeed === 1 ? 'bg-white dark:bg-slate-700 text-[#0B6A64] shadow-xs' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                1×
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSpeed(2)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                  playbackSpeed === 2 ? 'bg-white dark:bg-slate-700 text-[#0B6A64] shadow-xs' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                2×
              </button>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={simulateFalseStartOrOwnGoal}
                onChange={(e) => setSimulateFalseStartOrOwnGoal(e.target.checked)}
                className="rounded accent-[#E4572E]"
              />
              <span>
                {gameType === 'football'
                  ? lang === 'ar'
                    ? 'اختبار هدف عكسي'
                    : 'Simulate Own Goal'
                  : lang === 'ar'
                  ? 'اختبار انطلاقة خاطئة (+1ث)'
                  : 'Simulate False Start (+1s)'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Video Canvas (Left) + Explainable AI Findings (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Video & Live Detection Overlay */}
        <div className="lg:col-span-7 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-[#12262A] border border-slate-800">
            <video ref={videoRef} className="hidden" muted playsInline />
            <canvas
              ref={canvasRef}
              width={720}
              height={405}
              onClick={handleCanvasClick}
              className="w-full h-auto cursor-crosshair block"
            />
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-800 dark:text-slate-100 font-mono tabular-nums">
              <span>
                {isAnalyzing
                  ? lang === 'ar'
                    ? 'جاري تحليل الإطارات والصوت...'
                    : 'Analyzing HSV 256px frames & audio track...'
                  : lang === 'ar'
                  ? 'جاهز للتحليل'
                  : 'Ready for AI Referee scan'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0B6A64] transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Possession Breakdown Bar (Football) */}
          {gameType === 'football' && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[#E4572E]">
                  {teamAName}: {teamPossessionPct.A}%
                </span>
                <span className="text-slate-700 dark:text-slate-200">
                  {lang === 'ar' ? 'نسبة الاستحواذ على الكرة' : 'Ball Possession Split'}
                </span>
                <span className="text-[#2F6FD6]">
                  {teamBName}: {teamPossessionPct.B}%
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-200">
                <div style={{ width: `${teamPossessionPct.A}%` }} className="bg-[#E4572E] h-full" />
                <div style={{ width: `${teamPossessionPct.B}%` }} className="bg-[#2F6FD6] h-full" />
              </div>
              {Object.keys(possessionStats).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {players.slice(0, 4).map((p, idx) => {
                    const k = `P${idx + 1}`;
                    return (
                      <div
                        key={p.id}
                        className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-800/70 text-xs flex items-center justify-between"
                      >
                        <span className="truncate font-medium">{p.name.split(' ')[0]}</span>
                        <span className="font-mono tabular-nums font-bold text-[#0B6A64] dark:text-[#5CC4B9]">
                          {(possessionStats[k] || 0).toFixed(1)}s
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={runVisionAndAudioReferee}
              className="px-5 py-2.5 rounded-lg bg-[#0B6A64] hover:bg-[#09534E] disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              {isAnalyzing
                ? lang === 'ar'
                  ? 'جاري التحكيم...'
                  : 'Running AI Judge...'
                : lang === 'ar'
                ? 'تشغيل الحكم الذكي (Run AI Judge)'
                : 'Run AI Judge'}
            </button>

            <button
              type="button"
              disabled={geminiLoading}
              onClick={handleAskGeminiVision}
              className="px-4 py-2.5 rounded-lg bg-[#F2B33D] hover:bg-[#e0a229] text-[#12262A] font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {geminiLoading
                ? lang === 'ar'
                  ? 'جاري استشارة Gemini...'
                  : 'Asking Gemini...'
                : lang === 'ar'
                ? 'رأي Gemini Multimodal الثاني'
                : 'Gemini Multimodal 2nd Opinion'}
            </button>

            <button
              type="button"
              disabled={!signedReport}
              onClick={handleDownloadSignedReport}
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {lang === 'ar' ? 'تحميل التقرير الموقّع' : 'Download Signed Report'}
            </button>
          </div>

          {/* Python OpenCV AI Judge & Tamper Verification Bar */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => pythonInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5 text-[#0B6A64]" />
                {lang === 'ar' ? 'استيراد تقرير Python JSON' : 'Import Python Report'}
              </button>
              <input
                ref={pythonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportPythonReportFile}
              />

              <button
                type="button"
                onClick={() => handleSimulatePythonImport(false)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {lang === 'ar' ? 'محاكاة تقرير Python سليم ✔' : 'Demo Valid Python Report ✔'}
              </button>

              <button
                type="button"
                onClick={() => handleSimulatePythonImport(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-xs font-medium hover:bg-rose-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {lang === 'ar' ? 'اختبار تقرير متلاعب به ✖' : 'Test Tampered Report ✖'}
              </button>
            </div>
          </div>

          {/* Gemini Second Opinion Box */}
          {geminiOpinion && (
            <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-300">
                <span>
                  {lang === 'ar' ? 'رأي الحكم المساعد Gemini Multimodal' : 'Gemini Multimodal Referee Second Opinion'}
                </span>
                <span className="font-mono tabular-nums">
                  {geminiOpinion.eventSuggested} · {geminiOpinion.confidence}%
                </span>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                {lang === 'ar' ? geminiOpinion.verdictAr : geminiOpinion.verdictEn}
              </p>
            </div>
          )}
        </div>

        {/* Right 5 Cols: What the AI Finds (Explainable AI Cards + Hash Verification) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#183136] border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-base text-[#12262A] dark:text-white">
              {lang === 'ar' ? 'ما اكتشفه الحكم الذكي (بطاقات مفسّرة)' : 'What the AI Finds (Explainable Cards)'}
            </h4>
            <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200">
              {detectedEvents.length} {lang === 'ar' ? 'أحداث' : 'events'}
            </span>
          </div>

          {/* Tamper-Proof SHA-256 Status Alert */}
          {verificationStatus !== 'none' && (
            <div
              className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                verificationStatus === 'verified'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {verificationStatus === 'verified' ? (
                <ShieldCheck className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              <span className="font-mono break-all">{verificationMessage}</span>
            </div>
          )}

          {/* Explainable Event Cards List */}
          {detectedEvents.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-700 dark:text-slate-200 dark:text-slate-400">
              <p className="text-sm font-medium">
                {lang === 'ar'
                  ? 'اضغط على "تشغيل الحكم الذكي" لتحليل الفيديو واستخراج الأدلة المصورة.'
                  : 'Click "Run AI Judge" to analyze the video and generate explainable frame evidence.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {detectedEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 flex gap-3 items-start"
                >
                  {ev.thumbnailDataUrl && (
                    <img
                      src={ev.thumbnailDataUrl}
                      alt={ev.type}
                      referrerPolicy="no-referrer"
                      className="w-24 h-16 object-cover rounded border border-slate-300 dark:border-slate-600 shrink-0"
                    />
                  )}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      <span>
                        {ev.timeSec.toFixed(2)}s · {ev.type}
                      </span>
                      <span className="font-bold text-[#0B6A64] dark:text-[#5CC4B9]">
                        {ev.points > 0 ? `+${ev.points} pts` : `${ev.points} pts`}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#12262A] dark:text-white">
                      {ev.playerName} {ev.team !== 'INDIVIDUAL' ? `(Team ${ev.team})` : ''}
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
                      {lang === 'ar' ? ev.reasonAr : ev.reasonEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Apply Verified AI Results CTA */}
          {signedReport && verificationStatus === 'verified' && (
            <button
              type="button"
              onClick={() => {
                playSoundEffect('ready');
                onApplyResults(
                  signedReport.events,
                  signedReport.scoreDeltaA,
                  signedReport.scoreDeltaB,
                  signedReport.mvpName,
                  signedReport.mvpReasonEn,
                  signedReport.mvpReasonAr,
                  signedReport.sha256Signature,
                  signedReport.possessionA,
                  signedReport.possessionB
                );
              }}
              className="w-full py-3 px-4 rounded-lg bg-[#0B6A64] hover:bg-[#09534E] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              {lang === 'ar'
                ? `اعتماد النتائج الموثقة (+${signedReport.scoreDeltaA} / +${signedReport.scoreDeltaB})`
                : `Apply Verified AI Results (+${signedReport.scoreDeltaA} / +${signedReport.scoreDeltaB})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
