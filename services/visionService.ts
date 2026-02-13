
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (GEMINI IMPLEMENTATION)
 * PURPOSE: Analyzes a screenshot of a chess game and converts it to a FEN string.
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
            text: `You are a professional chess vision expert. 
            TASK: 
            1. Locate the active chess board in this screenshot.
            2. Analyze every square from a1 to h8.
            3. Identify the pieces: K=King, Q=Queen, R=Rook, B=Bishop, N=Knight, P=Pawn. 
               Uppercase for White, Lowercase for Black. Use '/' for rank separators and numbers for empty squares.
            4. Determine if the perspective at the bottom is 'white' or 'black'.
            5. Determine whose turn it is (w/b) based on UI indicators like turn clocks or highlight colors. Default to 'w' if unclear.
            6. Output a standard 6-part FEN string (e.g., 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').
            
            Return ONLY a JSON object.`
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
              description: 'The standard Forsyth-Edwards Notation (FEN). Must be valid and complete.',
            },
            bottomColor: {
              type: Type.STRING,
              description: 'Color at bottom: "white" or "black".',
            },
          },
          required: ["fen", "bottomColor"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Vision AI.");

    const result = JSON.parse(text.trim());
    
    // Basic FEN validation: check for 8 ranks
    if (!result.fen || result.fen.split('/').length < 8) {
        throw new Error("Invalid FEN format received.");
    }

    return result as VisionResult;
  } catch (error: any) {
    console.error("Vanguard Vision Error:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Unknown vision error" 
    };
  }
};
