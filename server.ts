import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Multimodal Vision Referee Second Opinion (Football & Camel Race)
app.post('/api/gemini/vision-referee', async (req, res) => {
  try {
    const { base64Image, mimeType, gameType, teamAName, teamBName, players } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image payload' });
    }

    const ai = getGenAIClient();
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const playerRoster = Array.isArray(players)
      ? players.map((p: { name: string; age: number; team: string; colour: string }) => `${p.name} (Age ${p.age}, Team ${p.team}, Shirt ${p.colour})`).join(', ')
      : 'Family players';

    const promptText =
      gameType === 'camel_race'
        ? `You are Hakam AI (حَكَم), the fair bilingual AI Referee for UAE Family Game Day.
Analyze this Camel Race Sprint frame. Players: ${playerRoster}.
Answer: Which runner is leading or crossed the finish line first? Were there any visible false-start advantages? Provide a concise, warm referee second opinion in both English and Arabic.`
        : `You are Hakam AI (حَكَم), the fair bilingual AI Referee for UAE Family Game Day.
Analyze this Family Football frame between ${teamAName || 'Falcons'} and ${teamBName || 'Oryx'}. Players: ${playerRoster}.
Answer: Who has possession of the ball right now? Was a goal scored or is the ball inside a goal zone? Provide a concise, warm referee second opinion in both English and Arabic.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdictEn: {
              type: Type.STRING,
              description: 'Referee call explanation in English (1-2 sentences).',
            },
            verdictAr: {
              type: Type.STRING,
              description: 'Referee call explanation in Arabic (1-2 sentences).',
            },
            detectedPlayer: {
              type: Type.STRING,
              description: 'Name of the key player in possession or leading the sprint.',
            },
            eventSuggested: {
              type: Type.STRING,
              description: 'Suggested event label such as GOAL, POSSESSION, PHOTO_FINISH, or CLEAR_PLAY.',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence percentage from 60 to 99.',
            },
          },
          required: ['verdictEn', 'verdictAr', 'detectedPlayer', 'eventSuggested', 'confidence'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error) {
    console.error('Gemini Vision Referee error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Gemini Vision Referee request failed',
    });
  }
});

// 2. Speech Referee Dialect Fallback Judge (Proverb Relay)
app.post('/api/gemini/proverb-judge', async (req, res) => {
  try {
    const { firstHalf, expectedEnding, meaningEn, spokenText } = req.body;
    if (!spokenText || !expectedEnding) {
      return res.status(400).json({ error: 'Missing spokenText or expectedEnding' });
    }

    const ai = getGenAIClient();
    const prompt = `You are Hakam AI (حَكَم), judging the Emirati/Arabic family game "Proverb Relay" (أكمل المثل).
Proverb first half: "${firstHalf}"
Official ending: "${expectedEnding}"
English meaning: "${meaningEn}"
Player's spoken answer: "${spokenText}"

Determine if the player's spoken answer is correct or an acceptable Emirati/Arabic dialect variation or English equivalent of the proverb's ending. Be encouraging and fair to kids and grandparents.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: {
              type: Type.BOOLEAN,
              description: 'True if the spoken answer matches the proverb ending or dialect equivalent.',
            },
            matchPercent: {
              type: Type.NUMBER,
              description: 'Semantic similarity percentage between 0 and 100.',
            },
            explanationEn: {
              type: Type.STRING,
              description: 'Short explanation in English.',
            },
            explanationAr: {
              type: Type.STRING,
              description: 'Short explanation in Arabic.',
            },
          },
          required: ['isCorrect', 'matchPercent', 'explanationEn', 'explanationAr'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error) {
    console.error('Gemini Proverb Judge error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Gemini Proverb Judge request failed',
    });
  }
});

// 3. Gemini AI Coach — Post-Game Family Summary & Player Tips
app.post('/api/gemini/coach-summary', async (req, res) => {
  try {
    const { gameType, teamAName, teamBName, scoreA, scoreB, winner, mvpName, players, events } = req.body;
    const ai = getGenAIClient();

    const playerList = Array.isArray(players)
      ? players.map((p: { name: string; age: number; team: string }) => `${p.name} (age ${p.age}, Team ${p.team})`).join(', ')
      : '';
    const eventSummary = Array.isArray(events)
      ? events.slice(0, 8).map((e: { timeSec: number; type: string; playerName: string; reasonEn: string }) => `[${e.timeSec}s] ${e.type} by ${e.playerName}: ${e.reasonEn}`).join('; ')
      : '';

    const prompt = `You are the Gemini AI Family Coach for Hakam AI (حَكَم) during UAE Year of Family 2026.
Game played: ${gameType}
Match Score: ${teamAName} ${scoreA} - ${scoreB} ${teamBName}
Winner: ${winner}
MVP: ${mvpName}
Players: ${playerList}
Key AI Referee Events: ${eventSummary}

Write a warm, uplifting, family-friendly summary (2-3 sentences) in both English and Arabic celebrating fair play and togetherness, plus one short, kind, constructive tip for each player in both English and Arabic.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryEn: {
              type: Type.STRING,
              description: 'Warm post-game summary in English.',
            },
            summaryAr: {
              type: Type.STRING,
              description: 'Warm post-game summary in Arabic.',
            },
            playerTips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  playerName: { type: Type.STRING },
                  tipEn: { type: Type.STRING },
                  tipAr: { type: Type.STRING },
                },
                required: ['playerName', 'tipEn', 'tipAr'],
              },
            },
          },
          required: ['summaryEn', 'summaryAr', 'playerTips'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error) {
    console.error('Gemini AI Coach error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Gemini AI Coach request failed',
    });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hakam AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
