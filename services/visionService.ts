
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 3.5)
 * Optimized for High-Frequency Neural Streaming
 */

export interface VisionResult {
  fen: string;
  bottomColor: 'white' | 'black';
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  error?: string;
}

const forceValidFen = (raw: string): string => {
  if (!raw || raw.trim().length === 0) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  let clean = raw.trim().split(/\s+/);
  const board = clean[0] || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const turn = clean[1] || "w";
  const castling = clean[2] || "KQkq";
  const ep = clean[3] || "-";
  const half = clean[4] || "0";
  const full = clean[5] || "1";
  return `${board} ${turn} ${castling} ${ep} ${half} ${full}`;
};

export const analyzeBoardVision = async (base64Image: string, needsCrop: boolean = false): Promise<VisionResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    return { fen: "", bottomColor: 'white', error: "API Key Required" };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `TASK: Board State Extraction.
            JSON: { "fen": "6-part FEN string", "bottomColor": "white"|"black", "boundingBox": [ymin,xmin,ymax,xmax] }
            Rules: High accuracy pieces. Perspective detection required.`
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fen: { type: Type.STRING },
            bottomColor: { type: Type.STRING, enum: ['white', 'black'] },
            boundingBox: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER },
              },
              required: ["ymin", "xmin", "ymax", "xmax"],
            }
          },
          required: ["fen", "bottomColor"],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    result.fen = forceValidFen(result.fen);
    return result as VisionResult;
  } catch (error: any) {
    return { fen: "", bottomColor: 'white', error: "Sync Latency Fault" };
  }
};
