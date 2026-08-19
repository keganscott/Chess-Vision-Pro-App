
/**
 * ENGINE SERVICE (ASSAULT MODE 3.6)
 * PURPOSE: Manages Stockfish with aggressive tactical settings.
 * Optimized for rapid FEN changes and high-pressure tactical play.
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
  fen: string;
}

const STOCKFISH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

class StockfishEngine {
  private worker: Worker | null = null;
  private onResultCallback: ((result: EngineResult) => void) | null = null;
  private currentMoves: Map<number, EngineMove> = new Map();
  private lastNodes: number = 0;
  private lastDepth: number = 0;
  private activeFen: string = '';
  private pendingResult: EngineResult | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([`importScripts("${STOCKFISH_URL}");`], {type: 'application/javascript'})));
      
      this.worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        
        // Parse info for evaluation scores but wait for 'bestmove' to fire the callback
        if (line.startsWith('info depth')) {
          this.parseInfoLine(line);
        } else if (line.startsWith('bestmove')) {
          this.handleBestMove(line);
        }
      };

      this.sendMessage('uci');
      this.sendMessage('isready');
      this.sendMessage('setoption name Skill Level value 20');
      this.sendMessage('setoption name MultiPV value 1'); // Changed to 1 to only show the absolute best move
      // ASSAULT CONFIG: High Contempt forces the bot to avoid draws and play for the win at all costs
      this.sendMessage('setoption name Contempt value 100'); 
      this.sendMessage('setoption name Threads value 4');
      this.sendMessage('setoption name Hash value 64');
    } catch (e) {
      console.error("Engine failure:", e);
    }
  }

  private parseInfoLine(line: string) {
    // Early exit for lines that don't contain PV (Principal Variation) info to save main-thread parsing time
    if (!line.includes(' pv ')) return;

    const depth = parseInt(this.extractValue(line, 'depth') || '0');
    const nodes = parseInt(this.extractValue(line, 'nodes') || '0');
    const pv = this.extractValue(line, 'pv');
    const multiPv = parseInt(this.extractValue(line, 'multipv') || '1');
    const cpValue = this.extractValue(line, 'cp');
    const mateValue = this.extractValue(line, 'mate');

    if (pv && depth >= 6) {
      const uciMove = pv.split(' ')[0];
      let evaluation = 0;
      if (mateValue) {
        evaluation = parseInt(mateValue) > 0 ? 99 : -99;
      } else if (cpValue) {
        evaluation = parseInt(cpValue) / 100;
      }

      let confidence = 0;
      if (mateValue) {
        confidence = 100;
      } else {
        const score = evaluation * 100;
        // Sharpened sigmoid to make tactical advantages feel more decisive
        confidence = Math.round(100 / (1 + Math.exp(-score / 100)));
      }

      const move: EngineMove = {
        from: uciMove.slice(0, 2).toUpperCase(),
        to: uciMove.slice(2, 4).toUpperCase(),
        san: uciMove,
        evaluation: evaluation,
        confidence: confidence
      };

      this.currentMoves.set(multiPv, move);
      this.lastNodes = nodes;
      this.lastDepth = depth;

      const sortedMoves = Array.from(this.currentMoves.entries())
        .sort(([a], [b]) => a - b)
        .map(([_, m]) => m);

      // Store the result but do NOT fire the callback yet
      this.pendingResult = {
        moves: sortedMoves,
        nodes: this.lastNodes,
        depth: this.lastDepth,
        fen: this.activeFen
      };
    }
  }

  private handleBestMove(line: string) {
    // line looks like: "bestmove e2e4 ponder e7e6"
    const parts = line.split(' ');
    if (parts.length >= 2 && parts[1] !== '(none)') {
      if (this.onResultCallback && this.pendingResult) {
        // We have the final move, now we can update the UI
        this.onResultCallback(this.pendingResult);
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

  public analyze(fen: string, callback: (result: EngineResult) => void) {
    if (this.activeFen === fen) return;
    this.activeFen = fen;
    this.currentMoves.clear();
    this.pendingResult = null;
    this.onResultCallback = callback;
    this.sendMessage('stop');
    this.sendMessage(`position fen ${fen}`);
    // 1.5 seconds is enough to think, prevents long flashing delays
    this.sendMessage('go movetime 1500'); 
  }

  public stop() {
    this.activeFen = '';
    this.sendMessage('stop');
  }
}

export const engine = new StockfishEngine();
