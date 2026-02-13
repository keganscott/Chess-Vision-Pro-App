
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (CHESSVISIONX OPTIMIZED)
 * PURPOSE: Robustly identifies the chess board within a potentially cluttered full-screen capture.
 */

export interface VisionResult {
  fen: string;
  bottomColor: 'white' | 'black';
  error?: string;
}

export const analyzeBoardVision = async (base64Image: string): Promise<VisionResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `You are the Vision Engine for ChessVisionX.
            
            IMAGE CONTEXT: This is a full-screen screenshot which may include browser tabs, sidebars, and desktop UI.
            
            STRICT INSTRUCTIONS:
            1. SCAN the image for the main 8x8 chess board. It is likely the largest square feature.
            2. CROP MENTALLY: Ignore all elements outside the 8x8 board (no clocks, no chat, no browser URL).
            3. PIECE IDENTIFICATION:
               - White pieces (Uppercase): K, Q, R, B, N, P
               - Black pieces (Lowercase): k, q, r, b, n, p
            4. PERSPECTIVE: Identify if White or Black is at the bottom of the board.
            5. TURN DETECTION: Look for highlight squares (often yellow/green) indicating the last move, or turn indicators next to avatars.
            6. FEN OUTPUT: Construct a valid 6-part FEN. Ensure it represents exactly what is on the board.
            
            Format your response as valid JSON with "fen" and "bottomColor".`
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
              description: 'The standard Forsyth-Edwards Notation string.',
            },
            bottomColor: {
              type: Type.STRING,
              enum: ['white', 'black'],
              description: 'The color perspective at the bottom of the screen.',
            },
          },
          required: ["fen", "bottomColor"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Magnus Vision Core.");

    const result = JSON.parse(text.trim());
    
    // Validate FEN structure
    if (!result.fen || result.fen.split('/').length < 8) {
      throw new Error("Invalid board mapping received.");
    }

    return result as VisionResult;
  } catch (error: any) {
    console.error("ChessVisionX Vision Error:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Vision synchronization failed." 
    };
  }
};
