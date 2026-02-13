
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (GEMINI IMPLEMENTATION)
 * PURPOSE: Analyzes a screenshot of a chess game and converts it to a FEN string.
 * Uses gemini-3-flash-preview for high-speed multimodal analysis.
 */

export interface VisionResult {
  fen: string;
  bottomColor: 'white' | 'black';
}

export const analyzeBoardVision = async (base64Image: string): Promise<VisionResult> => {
  // Use process.env.API_KEY directly as mandated by guidelines.
  // The SDK client is initialized per-request to ensure the latest configuration is respected.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: "Analyze the provided chess board image. Identify all pieces and their exact squares to generate a valid FEN string. Also, determine if the perspective at the bottom of the screen is from the 'white' or 'black' player. Return the result in JSON format."
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
              description: 'The standard Forsyth-Edwards Notation (FEN) for the detected board state.',
            },
            bottomColor: {
              type: Type.STRING,
              description: 'The color of the player at the bottom of the board ("white" or "black").',
            },
          },
          required: ["fen", "bottomColor"],
        },
      },
    });

    // Access the .text property directly (not a method) to retrieve the generated string.
    const jsonStr = response.text;
    if (!jsonStr) {
      throw new Error("Empty response received from the Gemini model.");
    }

    return JSON.parse(jsonStr.trim()) as VisionResult;
  } catch (error) {
    console.error("Vanguard Vision Sync Failed:", error);
    throw error;
  }
};
