import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

type ChatPersona =
  | 'calm_coach'
  | 'caregiver_guide'
  | 'cognitive_tutor'
  | 'accessibility_advisor';

const PERSONA_INSTRUCTIONS: Record<ChatPersona, string> = {
  calm_coach:
    'You are a warm, calm, trauma-informed mental wellness companion inside the AbleBridge assistive toolkit. Speak in short, soothing, encouraging sentences. Offer practical grounding, breathing, and stress-reduction steps. Never diagnose or prescribe medication.',
  caregiver_guide:
    'You are an experienced disability & elder-care support guide for family caregivers using AbleBridge. Give clear, practical caregiving tips for mobility, epilepsy safety, dementia memory care, paralysis support, and stress management. Always remind users to contact medical professionals or emergency services in urgent situations.',
  cognitive_tutor:
    'You are a patient, step-by-step cognitive and learning guide for users with dyslexia, ADHD, dyscalculia, aphasia, or memory challenges. Break every answer into numbered steps using plain language and concrete examples.',
  accessibility_advisor:
    'You are an assistive technology specialist helping configure AbleBridge tools (Vision Narrator, Sign Translator, Sound Radar, AAC Board, Routine Coach, Dyslexia Lens, Motor Scanner, Fall Guardian, Stress Tracker, and Safety Map) for individual physical and mental accessibility needs.',
};

function createGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/gemini/chat', async (req, res) => {
    const ai = createGenAIClient();
    if (!ai) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    try {
      const body = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        persona?: ChatPersona;
        model?: string;
        patientContext?: string;
        imageDataUrl?: string;
        language?: string;
      };

      const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
      if (!userMessage) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const persona: ChatPersona =
        body.persona && body.persona in PERSONA_INSTRUCTIONS
          ? body.persona
          : 'calm_coach';
      const selectedModel =
        body.model && ALLOWED_MODELS.has(body.model)
          ? body.model
          : 'gemini-4-hydrogen';

      const LANG_NAMES: Record<string, string> = {
        'en-US': 'English',
        'ml-IN': 'Malayalam (മലയാളം script)',
        'hi-IN': 'Hindi (हिन्दी Devanagari script)',
        'ta-IN': 'Tamil (தமிழ் script)',
        'kn-IN': 'Kannada (ಕನ್ನಡ script)',
        'te-IN': 'Telugu (తెలుగు script)',
        'es-ES': 'Spanish (Español)',
        'fr-FR': 'French (Français)',
        'ar-SA': 'Arabic (العربية script)',
      };
      const requestedLang = typeof body.language === 'string' ? body.language.trim() : 'en-US';
      const langInstruction =
        requestedLang && requestedLang !== 'en-US'
          ? `\n\nLanguage Requirement: Respond clearly and naturally in ${LANG_NAMES[requestedLang] || requestedLang} using native script so screen readers and voice synthesis in ${requestedLang} read it properly.`
          : '';

      const baseSystem = PERSONA_INSTRUCTIONS[persona];
      const systemInstruction = `${baseSystem}${
        body.patientContext
          ? `\n\nActive Accessibility Context:\n${body.patientContext.slice(0, 600)}`
          : ''
      }${langInstruction}`;

      const historyItems = Array.isArray(body.history)
        ? body.history
            .slice(-14)
            .filter(
              (item) =>
                item &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.text === 'string' &&
                item.text.trim().length > 0
            )
            .map((item) => ({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.text.slice(0, 4000) }],
            }))
        : [];

      const thinkingConfig =
        selectedModel === 'gemini-4-hydrogen'
          ? { thinkingLevel: ThinkingLevel.LOW }
          : undefined;

      const chat = ai.chats.create({
        model: selectedModel,
        history: historyItems,
        config: {
          systemInstruction,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });

      const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
      let messageContent: string | Array<string | { text?: string; inlineData?: { data: string; mimeType: string } }> = userMessage.slice(0, 4000);

      if (imageDataUrl && imageDataUrl.startsWith('data:')) {
        const commaIdx = imageDataUrl.indexOf(',');
        if (commaIdx !== -1) {
          const header = imageDataUrl.slice(0, commaIdx);
          const base64Data = imageDataUrl.slice(commaIdx + 1);
          const mimeMatch = header.match(/data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          messageContent = [
            { text: userMessage.slice(0, 4000) },
            { inlineData: { data: base64Data, mimeType } },
          ];
        }
      }

      const response = await chat.sendMessage({ message: messageContent });
      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({ error: 'Empty response received from Gemini model.' });
        return;
      }

      res.json({
        reply: replyText,
        model: selectedModel,
        persona,
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' ? errObj.status : 500;
      const message =
        errObj?.message || 'Unable to generate assistant response. Please try again.';
      console.error('Gemini chat error:', message);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  app.post('/api/gemini/stress-insight', async (req, res) => {
    const ai = createGenAIClient();
    if (!ai) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    try {
      const body = req.body as {
        latestScore?: number;
        mood?: string;
        mentalStatus?: string;
        recentTrend?: string;
        disabilities?: string[];
        language?: string;
      };

      const score = Number(body.latestScore ?? 5);
      const mood = String(body.mood ?? 'calm').slice(0, 40);
      const mentalStatus = String(body.mentalStatus ?? 'stable').slice(0, 40);
      const trend = String(body.recentTrend ?? 'No prior entries').slice(0, 600);
      const disabilities = Array.isArray(body.disabilities)
        ? body.disabilities.slice(0, 10).join(', ')
        : 'None specified';
      const requestedLang = typeof body.language === 'string' ? body.language.trim() : 'en-US';
      const langNote =
        requestedLang && requestedLang !== 'en-US'
          ? ` Respond strictly in language locale "${requestedLang}" using its native script.`
          : '';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Patient mental check-in: Stress ${score}/10, Mood "${mood}", Status "${mentalStatus}". Conditions: ${disabilities}. Recent trend: ${trend}. Provide a supportive 3-bullet action plan (max 90 words total) tailored to lowering stress safely right now.${langNote}`,
        config: {
          systemInstruction:
            'You are a gentle, concise accessibility wellness coach. Keep responses warm, structured, under 90 words, and non-clinical.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({
        insight: response.text?.trim() || 'Take three slow breaths and open Sensory Calm.',
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' ? errObj.status : 500;
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: errObj?.message || 'Failed to generate stress insight.',
      });
    }
  });

  app.post('/api/gemini/tts', async (req, res) => {
    const ai = createGenAIClient();
    if (!ai) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured.',
      });
      return;
    }

    try {
      const body = req.body as {
        text?: string;
        language?: string;
        persona?: string;
      };

      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      if (!rawText) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const safeText = rawText.slice(0, 900);
      const persona = String(body.persona ?? 'natural-female');
      const requestedLang = typeof body.language === 'string' ? body.language.trim() : 'en-US';

      const voiceByPersona: Record<string, 'Kore' | 'Fenrir' | 'Zephyr' | 'Puck' | 'Charon'> = {
        'natural-female': 'Kore',
        'natural-male': 'Fenrir',
        'human-warm': 'Zephyr',
        'human-gentle': 'Kore',
        robotic: 'Charon',
        system: 'Puck',
      };
      const styleByPersona: Record<string, string> = {
        'natural-female': `Clear, warm, natural assistive voice speaking fluently in ${requestedLang}`,
        'natural-male': `Calm, steady, deep, articulate assistive voice speaking fluently in ${requestedLang}`,
        'human-warm': `Friendly, empathetic conversational human voice speaking in ${requestedLang}`,
        'human-gentle': `Soft, soothing, gentle calming voice speaking slowly and clearly in ${requestedLang}`,
        robotic: `Crisp, neutral, high-clarity screen-reader cadence in ${requestedLang}`,
        system: `Standard clear assistive narrator in ${requestedLang}`,
      };

      const voiceName = voiceByPersona[persona] ?? 'Kore';
      const style = styleByPersona[persona] ?? styleByPersona['natural-female'];

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: safeText,
                speechMetadata: {
                  style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned by TTS model.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName,
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' ? errObj.status : 500;
      console.error('Gemini TTS error:', errObj?.message);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: errObj?.message || 'Speech synthesis failed.',
      });
    }
  });

  app.post('/api/gemini/vision-analyze', async (req, res) => {
    const ai = createGenAIClient();
    if (!ai) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    try {
      const body = req.body as {
        imageDataUrl?: string;
        mode?: 'scene' | 'color' | 'currency';
        language?: string;
        crosshairHint?: string;
      };

      const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
      if (!imageDataUrl.startsWith('data:')) {
        res.status(400).json({ error: 'Valid base64 imageDataUrl is required.' });
        return;
      }

      const commaIdx = imageDataUrl.indexOf(',');
      if (commaIdx === -1) {
        res.status(400).json({ error: 'Malformed image data URL.' });
        return;
      }

      const header = imageDataUrl.slice(0, commaIdx);
      const base64Data = imageDataUrl.slice(commaIdx + 1);
      const mimeMatch = header.match(/data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const mode =
        body.mode === 'color' || body.mode === 'currency' ? body.mode : 'scene';

      const LANG_NAMES: Record<string, string> = {
        'en-US': 'English',
        'ml-IN': 'Malayalam (മലയാളം script)',
        'hi-IN': 'Hindi (हिन्दी Devanagari script)',
        'ta-IN': 'Tamil (தமிழ் script)',
        'kn-IN': 'Kannada (ಕನ್ನಡ script)',
        'te-IN': 'Telugu (తెలుగు script)',
        'es-ES': 'Spanish (Español)',
        'fr-FR': 'French (Français)',
        'ar-SA': 'Arabic (العربية script)',
      };
      const requestedLang = typeof body.language === 'string' ? body.language.trim() : 'en-US';
      const targetLanguageLabel = LANG_NAMES[requestedLang] || 'English';
      const hint =
        typeof body.crosshairHint === 'string' && body.crosshairHint.trim()
          ? `Local center sensor hint: ${body.crosshairHint.slice(0, 220)}.`
          : '';

      const modePrompt =
        mode === 'currency'
          ? `Carefully examine every banknote and coin visible in this image.
Identify the exact currency (e.g., Indian Rupee INR ₹, US Dollar USD $, Euro EUR €, British Pound GBP £, etc.), each visible denomination, quantity of each note/coin, and calculate the total value if multiple bills/coins are present. Distinguish lookalike bills carefully by color, numerals, security thread, and portrait/motif. If blurry or uncertain, state that clearly instead of guessing.`
          : mode === 'color'
            ? `Carefully identify the true surface color(s), shade (light/dark/bright/muted), material or fabric pattern (solid, striped, checkered, floral, metallic, matte), and the object under the center crosshair. Compensate mentally for warm/cool ambient lighting shadows so color naming is accurate for a visually impaired user.`
            : `Act as an assistive live-scene narrator for a blind or low-vision user. First state any hazards or obstacles directly ahead, then identify key objects, people, medicine bottle labels, printed signs, or packaging text accurately and concisely.`;

      const prompt = `${modePrompt}
${hint}

Respond strictly in ${targetLanguageLabel} using natural native script for all text fields (primaryResult, spokenSummary, details, dominantColors), while currencyTotal can use standard currency symbols plus number (e.g. "₹500" or "$20 USD"). Keep spokenSummary under 40 words so it is fast and effortless to listen to.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType } },
        ],
        config: {
          systemInstruction:
            'You are a high-precision assistive computer-vision analyst for blind and low-vision users. Never fabricate details that are not clearly visible.',
          thinkingConfig: {
            thinkingLevel: mode === 'currency' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              primaryResult: { type: Type.STRING },
              spokenSummary: { type: Type.STRING },
              details: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              currencyTotal: { type: Type.STRING },
              dominantColors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              confidence: {
                type: Type.STRING,
                enum: ['high', 'medium', 'low'],
              },
            },
            required: ['primaryResult', 'spokenSummary', 'details', 'confidence'],
          },
        },
      });

      const rawJson = response.text?.trim() || '{}';
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = {
          primaryResult: rawJson.slice(0, 120),
          spokenSummary: rawJson.slice(0, 240),
          details: [],
          confidence: 'medium',
        };
      }

      res.json({
        mode,
        language: requestedLang,
        ...parsed,
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' ? errObj.status : 500;
      console.error('Gemini vision analyze error:', errObj?.message);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: errObj?.message || 'Vision analysis failed.',
      });
    }
  });

  app.post('/api/alerts/notify', async (req, res) => {
    try {
      const body = req.body as {
        patientName?: string;
        caregiverName?: string;
        caregiverPhone?: string;
        alertEmail?: string;
        reason?: string;
        lat?: number;
        lng?: number;
        remoteAccessCode?: string;
      };

      const patientName = String(body.patientName ?? 'Patient').trim().slice(0, 120);
      const caregiverName = String(body.caregiverName ?? 'Caregiver').trim().slice(0, 120);
      const caregiverPhone = String(body.caregiverPhone ?? '').trim().slice(0, 40);
      const alertEmail = String(body.alertEmail ?? '').trim().slice(0, 160);
      const reason = String(body.reason ?? 'Immediate Caregiver Call / Emergency Alert')
        .trim()
        .slice(0, 200);
      const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : 37.7793;
      const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : -122.4193;
      const code = String(body.remoteAccessCode ?? '').trim().slice(0, 16);

      const mapsLink = `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
      const bodyText = [
        `ABLEBRIDGE CAREGIVER ALERT for ${patientName}`,
        `Alert Reason: ${reason}`,
        `Caregiver Contact: ${caregiverName} (${caregiverPhone || 'Not set'})`,
        `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        `Map Link: ${mapsLink}`,
        code ? `Remote Portal Code: ${code}` : '',
        `Sent: ${new Date().toISOString()}`,
      ]
        .filter(Boolean)
        .join('\n');

      const subject = `[AbleBridge Alert] ${patientName}: ${reason}`;
      const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail);
      const mailtoUrl = hasValidEmail
        ? `mailto:${encodeURIComponent(alertEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
        : null;
      const cleanDigits = caregiverPhone.replace(/[^\d+]/g, '');
      const hasValidPhone = cleanDigits.replace(/\+/g, '').length >= 3;
      const telUrl = hasValidPhone ? `tel:${cleanDigits}` : null;
      const smsUrl = hasValidPhone
        ? `sms:${cleanDigits}?body=${encodeURIComponent(bodyText)}`
        : null;

      let webhookDelivered = false;
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
        try {
          const hookRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              event: 'ablebridge_caregiver_alert',
              patientName,
              caregiverName,
              caregiverPhone,
              alertEmail,
              reason,
              lat,
              lng,
              mapsLink,
              remoteAccessCode: code,
              timestamp: new Date().toISOString(),
            }),
          });
          webhookDelivered = hookRes.ok;
        } catch (err) {
          console.error('Webhook notification relay failed:', err);
        }
      }

      res.json({
        recorded: true,
        timestamp: new Date().toISOString(),
        webhookDelivered,
        channel: webhookDelivered ? 'webhook_and_device_links' : 'device_links_and_firestore',
        telUrl,
        mailtoUrl,
        smsUrl,
        mapsLink,
        summary: bodyText,
      });
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Unable to prepare caregiver notification.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const safeCode = result.code
            .replace(/transport\.connect\([^;]*\);/, '/* HMR WebSocket disabled */')
            .replace(/throw new SendBeforeConnectError\([^)]*\);?/g, 'return;');
          res.setHeader('Content-Type', 'application/javascript');
          res.send(safeCode);
          return;
        }
      } catch {
        // Fallback to default Vite handler if transformRequest fails
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AbleBridge server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
