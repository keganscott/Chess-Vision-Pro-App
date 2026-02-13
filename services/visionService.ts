import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (GEMINI IMPLEMENTATION)
 * PURPOSE: Analyzes a screenshot of a chess game and converts it to a FEN string.
 */

export interface VisionResult {
  fen: string;
  bottomColor: 'white' | 'black';
}

export const analyzeBoardVision = async (base64Image: string): Promise<VisionResult> => {
  // We strictly use the SDK initialization as required.
  // Note: This requires a Google Gemini API Key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
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

    // Accessing .text property directly as per coding guidelines.
    const jsonStr = response.text;
    if (!jsonStr) {
      throw new Error("Vanguard Internal: No response data received.");
    }

    return JSON.parse(jsonStr.trim()) as VisionResult;
  } catch (error) {
    console.error("Vanguard Vision Sync Failed:", error);
    throw error;
  }
};