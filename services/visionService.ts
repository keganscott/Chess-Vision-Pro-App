
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 4.0 - ASSAULT)
 * Optimized for High-Precision Pixel Mapping and Grid Verification
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
  
  // Basic validation to prevent game-breaking board states
  const parts = raw.trim().split(/\s+/);
  const board = parts[0] || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  
  // Count kings - if AI hallucinations occur, we force a reset to prevent errors
  const whiteKings = (board.match(/K/g) || []).length;
  const blackKings = (board.match(/k/g) || []).length;
  
  if (whiteKings !== 1 || blackKings !== 1) {
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }

  const turn = parts[1] || "w";
  const castling = parts[2] || "KQkq";
  const ep = parts[3] || "-";
  const half = parts[4] || "0";
  const full = parts[5] || "1";
  
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
            text: `PRECISION CHESS EXTRACTION (ASSAULT 4.0)
            1. Find the 8x8 chess board (Chess.com/Lichess style).
            2. Identify every piece with 100% accuracy. Empty squares are digit numbers.
            3. Detect perspective: Which color is at the bottom?
            4. Detect turn: Based on last move highlights if visible.
            
            OUTPUT: Strict JSON only.
            {
              "fen": "full_fen_string",
              "bottomColor": "white"|"black",
              "boundingBox": {"ymin": 0, "xmin": 0, "ymax": 1000, "xmax": 1000}
            }`
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

    const text = response.text || '{}';
    const result = JSON.parse(text);
    
    // Safety check for empty or malformed FEN
    if (!result.fen || result.fen.length < 15) {
       throw new Error("Neural Blur: Incomplete Board Detected");
    }

    result.fen = forceValidFen(result.fen);
    return result as VisionResult;
  } catch (error: any) {
    console.error("Vision Bridge Failure:", error);
    return { fen: "", bottomColor: 'white', error: error.message || "Sync Latency Fault" };
  }
};
