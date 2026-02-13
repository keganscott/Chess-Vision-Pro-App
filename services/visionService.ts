
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 3.0)
 * Optimized for Mirroring Piece Movements in Real-Time
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
            text: `ACT AS: Magnus Vision Engine 3.0.
            TASK: Map the exact piece locations from the provided screen capture.
            
            DIRECTIONS:
            1. PIECES: Identify every piece precisely. This is for a real-time replica.
               - CAPITAL = White pieces
               - lowercase = Black pieces
            2. FOCUS: Find the 8x8 chess board. Provide its [ymin, xmin, ymax, xmax] coordinates (0-1000).
            3. PERSPECTIVE: Which color is at the bottom of the board?
            4. FEN: Generate the complete FEN string based ONLY on the visual state of the pieces.
            
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
    if (!rawText) throw new Error("Neural response timeout.");

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON Parse Error.");
    
    const result = JSON.parse(match[0]);
    if (!result.fen || result.fen.split('/').length < 8) {
       throw new Error("FEN incomplete.");
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
