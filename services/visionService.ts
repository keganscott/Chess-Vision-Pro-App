
import { GoogleGenAI, Type } from "@google/genai";

/**
 * VISION SERVICE (MAGNUS VISION CORE 2.7)
 * PURPOSE: High-speed FEN extraction from screen captures.
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
  // Directly using injected key as per system requirements
  const apiKey = process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey || "" });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `ACT AS: Magnus Vision Core 2.7.
            TASK: Map the chess board state from this capture.
            
            STRICT RULES:
            1. SCAN: Find the main 8x8 grid. Ignore external browser elements.
            2. COORDINATES: Provide the bounding box [ymin, xmin, ymax, xmax] (0-1000).
            3. PERSPECTIVE: Identify if "white" or "black" pieces are at the bottom.
            4. FEN: Generate the complete FEN string. Double-check piece positions.
            
            OUTPUT: RETURN ONLY VALID JSON. NO MARKDOWN. NO CONVERSATION.`
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
    if (!rawText) throw new Error("Vision engine returned no data.");

    // Aggressive JSON extraction
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Neural output was not in JSON format.");
    
    const result = JSON.parse(match[0]);
    if (!result.fen) throw new Error("FEN mapping failed.");

    return result as VisionResult;
  } catch (error: any) {
    console.error("Vision Bridge Failure:", error);
    return { 
      fen: "", 
      bottomColor: 'white', 
      error: error.message || "Mapping failure." 
    };
  }
};
