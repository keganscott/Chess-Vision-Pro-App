
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 2.9)
 * PURPOSE: Robust FEN extraction from screen captures.
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
  // Always retrieve the latest key from the process environment
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: "API Key Not Detected. Please authorize via 'Connect API Key' in the top right header." 
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `ACT AS: Magnus Vision Core 2.9.
            TASK: Map the real-time board from this capture.
            
            RULES:
            1. SCAN: Focus exclusively on the 8x8 chess board.
            2. COORDINATES: Provide the [ymin, xmin, ymax, xmax] of the 8x8 board square (0-1000).
            3. PIECES: Identify every piece exactly. 
               - White pieces are CAPITAL (K, Q, R, B, N, P).
               - Black pieces are lowercase (k, q, r, b, n, p).
            4. PERSPECTIVE: Identify which side is at the bottom (white or black).
            5. FEN: Generate the complete 6-part FEN string.
            
            OUTPUT: RETURN ONLY VALID JSON. NO MARKDOWN.`
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
    if (!rawText) throw new Error("Neural core returned empty response.");

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Neural output format mismatch.");
    
    const result = JSON.parse(match[0]);
    if (!result.fen || result.fen.split('/').length < 8) {
       throw new Error("Neural position incomplete.");
    }

    return result as VisionResult;
  } catch (error: any) {
    console.error("Magnus Vision Error:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Vision bridge failure." 
    };
  }
};
