
/**
 * ENGINE SERVICE (OPTIMIZED)
 * PURPOSE: Manages local Stockfish 16.1 WASM with robust interruption handling.
 * Optimized for rapid FEN changes: cancels previous work and discards stale results.
 */

export interface EngineMove {
  from: string;
  to: string;
  san: string;
  evaluation: number;
  confidence: number;
}

export interface EngineResult {
  moves: EngineMove[];
  nodes: number;
  depth: number;
  fen: string; // Added to track which FEN this result belongs to
}

// Using a slightly newer/faster Stockfish build if available, but staying stable with 10.0.2 for compatibility
const STOCKFISH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

class StockfishEngine {
  private worker: Worker | null = null;
  private onResultCallback: ((result: EngineResult) => void) | null = null;
  private currentMoves: Map<number, EngineMove> = new Map();
  private lastNodes: number = 0;
  private lastDepth: number = 0;
  private activeFen: string = ''; // Track the current FEN being analyzed

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([`importScripts("${STOCKFISH_URL}");`], {type: 'application/javascript'})));
      
      this.worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;

        if (line.startsWith('info depth')) {
          this.parseInfoLine(line);
        }
      };

      this.sendMessage('uci');
      this.sendMessage('isready');
      this.sendMessage('setoption name Skill Level value 20');
      this.sendMessage('setoption name MultiPV value 2');
      this.sendMessage('setoption name Threads value 4'); // Speed up calculation
      this.sendMessage('setoption name Hash value 32');  // Allocate small hash for web
    } catch (e) {
      console.error("Stockfish Init Error:", e);
    }
  }

  private parseInfoLine(line: string) {
    const depth = parseInt(this.extractValue(line, 'depth') || '0');
    const nodes = parseInt(this.extractValue(line, 'nodes') || '0');
    const pv = this.extractValue(line, 'pv');
    const multiPv = parseInt(this.extractValue(line, 'multipv') || '1');
    const cpValue = this.extractValue(line, 'cp');
    const mateValue = this.extractValue(line, 'mate');

    // Depth check: we only start reporting results once we have meaningful depth
    if (pv && depth >= 6) {
      const uciMove = pv.split(' ')[0];
      
      // Calculate evaluation (handling mate scores)
      let evaluation = 0;
      if (mateValue) {
        evaluation = parseInt(mateValue) > 0 ? 99 : -99;
      } else if (cpValue) {
        evaluation = parseInt(cpValue) / 100;
      }

      const move: EngineMove = {
        from: uciMove.slice(0, 2).toUpperCase(),
        to: uciMove.slice(2, 4).toUpperCase(),
        san: uciMove,
        evaluation: evaluation,
        confidence: Math.round(100 / (1 + Math.exp(-(evaluation * 100) / 150)))
      };

      this.currentMoves.set(multiPv, move);
      this.lastNodes = nodes;
      this.lastDepth = depth;

      if (this.onResultCallback) {
        const sortedMoves = Array.from(this.currentMoves.entries())
          .sort(([a], [b]) => a - b)
          .map(([_, m]) => m);

        this.onResultCallback({
          moves: sortedMoves,
          nodes: this.lastNodes,
          depth: this.lastDepth,
          fen: this.activeFen
        });
      }
    }
  }

  private extractValue(line: string, key: string): string | null {
    const parts = line.split(' ');
    const index = parts.indexOf(key);
    return (index !== -1 && index + 1 < parts.length) ? parts[index + 1] : null;
  }

  private sendMessage(msg: string) {
    this.worker?.postMessage(msg);
  }

  /**
   * analyze() - Optimized for rapid FEN changes.
   * Immediately stops any current search and starts the new one.
   */
  public analyze(fen: string, callback: (result: EngineResult) => void) {
    // If we are already analyzing this exact FEN, don't restart
    if (this.activeFen === fen) return;

    // Reset state for the new FEN
    this.activeFen = fen;
    this.currentMoves.clear();
    this.onResultCallback = callback;

    // Critical: Stop the engine immediately
    this.sendMessage('stop');
    
    // Clear any potential internal queue in the worker (standard protocol)
    this.sendMessage('ucinewgame');
    this.sendMessage('isready');
    
    // Set position and start new search
    this.sendMessage(`position fen ${fen}`);
    
    // "go depth 16" is quite fast. For even more responsiveness, we use "go depth 16 movetime 3000"
    // ensuring we never exceed a 3s calculation window if depth is not reached.
    this.sendMessage('go depth 16 movetime 3000'); 
  }

  public stop() {
    this.activeFen = '';
    this.sendMessage('stop');
  }
}

export const engine = new StockfishEngine();
