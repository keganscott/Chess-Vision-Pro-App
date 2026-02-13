
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 3.1)
 * Optimized for Mirroring Piece Movements & Self-Healing FENs
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

/**
 * FEN REPAIR ENGINE
 * Ensures the FEN string always has 6 parts as required by chess.js
 */
const repairFen = (rawFen: string): string => {
  if (!rawFen) return "";
  const parts = rawFen.trim().split(/\s+/);
  
  // If we only have the piece layout part (the most common vision output)
  if (parts.length === 1) {
    // Default to white to move, full castling rights, no en passant, 0 halfmoves, 1 fullmove
    return `${parts[0]} w KQkq - 0 1`;
  }
  
  // If we have some parts but not all 6
  if (parts.length < 6) {
    const defaults = ["w", "KQkq", "-", "0", "1"];
    const repairedParts = [...parts];
    for (let i = parts.length; i < 6; i++) {
      repairedParts.push(defaults[i - 1]);
    }
    return repairedParts.join(" ");
  }
  
  return rawFen;
};

export const analyzeBoardVision = async (base64Image: string, needsCrop: boolean = false): Promise<VisionResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: "No active API Key. Please click 'Connect API Key' in the HUD header." 
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `ACT AS: Magnus Vision Engine 3.1.
            TASK: Synchronize this replica board with the provided screen capture.
            
            STRICT DIRECTIONS:
            1. PIECE ACCURACY: Every piece location must be 100% accurate. 
               - White pieces: K, Q, R, B, N, P
               - Black pieces: k, q, r, b, n, p
            2. FULL FEN: You MUST return a complete 6-part FEN string (e.g., "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"). 
               - If unsure of turn/castling, use "w KQkq - 0 1" as the suffix.
            3. BOARD POSITION: Find the exact 8x8 square of the board. Return coordinates [ymin, xmin, ymax, xmax] (0-1000 scale).
            4. VIEWPORT: Detect if white or black is at the bottom.
            
            JSON OUTPUT ONLY.`
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

    const rawText = response.text;
    if (!rawText) throw new Error("Vision core timeout.");

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid response format.");
    
    const result = JSON.parse(match[0]);
    
    // APPLY FEN REPAIR
    result.fen = repairFen(result.fen);

    if (result.fen.split('/').length < 8) {
       throw new Error("Neural piece mapping incomplete.");
    }

    return result as VisionResult;
  } catch (error: any) {
    console.error("Vision Sync Failure:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Vision bridge failure." 
    };
  }
};
