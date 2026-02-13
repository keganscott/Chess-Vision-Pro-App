
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE)
 * PURPOSE: Robustly identifies the chess board within a cluttered screen capture.
 */

export interface VisionResult {
  fen: string;
  bottomColor: 'white' | 'black';
  error?: string;
}

export const analyzeBoardVision = async (base64Image: string): Promise<VisionResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `ACT AS: Magnus Vision Core.
            TASK: Extract FEN from this screen capture.
            
            1. SCAN: Look for the 8x8 chess board.
            2. FOCUS: Ignore all external UI (tabs, sidebar, desktop).
            3. PIECE MAP: 
               - Upper (White): K, Q, R, B, N, P
               - Lower (Black): k, q, r, b, n, p
            4. PERSPECTIVE: Determine if "white" or "black" is at the bottom.
            5. RESPONSE: Return ONLY a JSON object with keys "fen" and "bottomColor". No extra text. No markdown blocks.`
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
            fen: {
              type: Type.STRING,
              description: 'Complete 6-part FEN string.',
            },
            bottomColor: {
              type: Type.STRING,
              enum: ['white', 'black'],
              description: 'Color perspective at bottom.',
            },
          },
          required: ["fen", "bottomColor"],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) throw new Error("Null response from vision core.");

    // Clean any potential markdown wrapping
    const cleanedJson = rawText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanedJson);
    
    if (!result.fen || result.fen.split('/').length < 8) {
      throw new Error("Invalid FEN data.");
    }

    return result as VisionResult;
  } catch (error: any) {
    console.error("ChessVisionX Vision Error:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Mapping failure." 
    };
  }
};
