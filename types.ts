
export interface ChessMove {
  from: string;
  to: string;
  san: string;
  confidence: number;
}

export interface ChessAnalysis {
  fen: string;
  topMoves: ChessMove[];
  threats: string[];
}

export interface AnalysisState {
  isLoading: boolean;
  error: string | null;
  data: ChessAnalysis | null;
  lastUpdated: Date | null;
}

export enum CaptureMode {
  SCREEN = 'SCREEN',
  CAMERA = 'CAMERA'
}

export const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
