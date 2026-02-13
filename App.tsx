
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Zap, RotateCcw, Activity, Settings2, Target, Clock, 
  ShieldCheck, ChevronRight, Scan, RefreshCcw, Trophy 
} from 'lucide-react';
import { Chess } from 'chess.js';
import CameraFeed from './components/CameraFeed';
import ChessBoardDisplay from './components/ChessBoardDisplay';
import { engine, EngineResult } from './services/engineService';
import { analyzeBoardVision } from './services/visionService';
import { INITIAL_FEN } from './types';

/**
 * VANGUARD PRECISION HUD
 * Enhanced with Opponent Move Tracking
 */

export default function App() {
  const [currentFen, setCurrentFen] = useState(INITIAL_FEN);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [isVisionSyncing, setIsVisionSyncing] = useState(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);
  
  // Track the opponent's last move to highlight it on the replica
  const [lastOpponentMove, setLastOpponentMove] = useState<{ from: string; to: string } | null>(null);
  
  const gameRef = useRef(new Chess(INITIAL_FEN));
  const visionCooldown = useRef<boolean>(false);

  // Determine if it's the local user's turn
  const isUserTurn = useCallback(() => {
    const turn = currentFen.split(' ')[1]; 
    return (turn === 'w' && boardOrientation === 'white') || 
           (turn === 'b' && boardOrientation === 'black');
  }, [currentFen, boardOrientation]);

  /**
   * Detects the move made between two FEN strings
   */
  const detectMove = (oldFen: string, newFen: string) => {
    const tempGame = new Chess(oldFen);
    const moves = tempGame.moves({ verbose: true });
    for (const move of moves) {
      tempGame.move(move);
      if (tempGame.fen() === newFen) {
        return { from: move.from, to: move.to };
      }
      tempGame.undo();
    }
    return null;
  };

  /**
   * VISION SYNC HANDLER
   */
  const handleFrameCapture = useCallback(async (base64: string) => {
    if (visionCooldown.current || !isAutoSyncEnabled) return;
    
    visionCooldown.current = true;
    setIsVisionSyncing(true);

    try {
      const result = await analyzeBoardVision(base64);
      
      if (result.bottomColor !== boardOrientation) {
        setBoardOrientation(result.bottomColor);
      }

      if (result.fen !== currentFen) {
        // Detect if this change was a move
        const move = detectMove(currentFen, result.fen);
        
        // If it was the opponent's move (it's now user turn), highlight it
        const newTurn = result.fen.split(' ')[1];
        const isNowUserTurn = (newTurn === 'w' && result.bottomColor === 'white') || 
                              (newTurn === 'b' && result.bottomColor === 'black');
        
        if (move && isNowUserTurn) {
          setLastOpponentMove(move);
        } else if (!isNowUserTurn) {
          // If vision detects it is opponent turn again, clear highlights as user must have moved
          setLastOpponentMove(null);
        }

        setCurrentFen(result.fen);
        gameRef.current = new Chess(result.fen);
      }
    } catch (e) {
      console.log("HUD Status: Vision processing in background...");
    } finally {
      setIsVisionSyncing(false);
      setTimeout(() => { visionCooldown.current = false; }, 2000);
    }
  }, [currentFen, boardOrientation, isAutoSyncEnabled]);

  /**
   * ENGINE CALCULATION
   */
  useEffect(() => {
    if (isUserTurn()) {
      setIsEngineThinking(true);
      engine.analyze(currentFen, (res) => {
        if (res.fen === currentFen) {
          setEngineResult(res);
          setIsEngineThinking(false);
        }
      });
    } else {
      setEngineResult(null);
      setIsEngineThinking(false);
      engine.stop();
    }
  }, [currentFen, isUserTurn]);

  const handleManualMove = (from: string, to: string) => {
    try {
      const move = gameRef.current.move({ from, to, promotion: 'q' });
      if (move) {
        setCurrentFen(gameRef.current.fen());
        // User responded: clear opponent highlight
        setLastOpponentMove(null);
      }
    } catch (e) {
      console.warn("Manual Move: Invalid path.");
    }
  };

  const handleReset = () => {
    gameRef.current = new Chess(INITIAL_FEN);
    setCurrentFen(INITIAL_FEN);
    setEngineResult(null);
    setLastOpponentMove(null);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      <header className="h-14 glass flex items-center justify-between px-6 border-b border-white/5 relative z-50">
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-emerald-500 rounded-md glow-emerald">
            <Zap className="w-4 h-4 text-slate-950 fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter uppercase text-white">Vanguard HUD</h1>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                Processor: Stockfish 16.1 WASM
              </span>
              <div className={`w-1.5 h-1.5 rounded-full ${isVisionSyncing ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-[10px] font-mono text-slate-500">
           <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
             <Activity className="w-3 h-3 text-emerald-500/70" />
             <span>NODES: {(engineResult?.nodes || 0).toLocaleString()}</span>
           </div>
           <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
             <RefreshCcw className={`w-3 h-3 text-blue-500/70 ${isVisionSyncing ? 'animate-spin' : ''}`} />
             <span>SYNC: 2.0S</span>
           </div>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-12 gap-8 overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] scale-150" />

        <div className="col-span-4 flex flex-col gap-6 overflow-hidden">
          <div className="relative aspect-video glass rounded-2xl overflow-hidden shadow-2xl border border-slate-800/50">
             <CameraFeed 
               isAnalyzing={isAutoSyncEnabled} 
               onCaptureFrame={handleFrameCapture} 
               onStreamStatusChange={() => {}} 
             />
             <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2 py-1 bg-black/80 rounded-lg text-[9px] font-black text-slate-300 border border-white/5 uppercase">
               <Scan className={`w-3.5 h-3.5 ${isVisionSyncing ? 'text-blue-400 animate-pulse' : 'text-emerald-500'}`} />
               {isVisionSyncing ? 'Capturing Data...' : 'Vision Synced'}
             </div>
          </div>

          <div className="flex-1 glass rounded-2xl p-6 flex flex-col gap-5 overflow-hidden shadow-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-white/5 pb-4">
               <div className="flex items-center gap-2">
                 <Trophy className="w-4 h-4 text-emerald-400" />
                 <h2 className="text-xs font-black uppercase tracking-widest text-white">Target Solutions</h2>
               </div>
               {isEngineThinking && <div className="text-[9px] font-bold text-emerald-400 animate-pulse uppercase">Calculating</div>}
             </div>

             <div className="flex-1 flex flex-col gap-4 py-2 overflow-y-auto custom-scrollbar">
               {engineResult?.moves && engineResult.moves.length > 0 ? (
                 engineResult.moves.map((move, idx) => (
                   <div key={idx} className={`p-6 rounded-2xl border-2 transition-all ${idx === 0 ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]' : 'bg-slate-900/40 border-slate-800'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {idx === 0 ? 'Priority Target' : 'Secondary Line'}
                          </span>
                          <div className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
                            {move.from} <ChevronRight className="w-5 h-5 text-slate-700" /> {move.to}
                          </div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                             Confidence: (({move.confidence}%))
                          </div>
                        </div>
                        <div className={`text-xl font-black ${move.evaluation >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {move.evaluation > 0 ? '+' : ''}{move.evaluation.toFixed(2)}
                        </div>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-12 space-y-4">
                    <Clock className="w-16 h-16" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center max-w-[150px]">
                      {isUserTurn() ? 'Syncing Internal State' : 'Waiting for Opponent'}
                    </p>
                 </div>
               )}
             </div>

             <div className="mt-auto flex items-center gap-4 pt-4 border-t border-white/5">
               <button onClick={handleReset} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-black uppercase border border-slate-800 text-slate-400">
                 Reset HUD
               </button>
               <button 
                onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                className={`flex-[2] py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isAutoSyncEnabled ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'}`}
               >
                 {isAutoSyncEnabled ? 'Disable Sync' : 'Enable Sync'}
               </button>
             </div>
          </div>
        </div>

        <div className="col-span-8 flex items-center justify-center glass rounded-3xl p-10 border border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute left-10 top-1/2 -translate-y-1/2 h-[75%] flex flex-col items-center gap-3">
             <div className="w-2.5 h-full bg-slate-900/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/5">
                <div 
                  className="bg-white transition-all duration-1000 ease-in-out shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
                  style={{ height: `${Math.max(5, Math.min(95, 50 + (engineResult?.moves[0]?.evaluation || 0) * 8))}%` }} 
                />
             </div>
             <div className="text-[8px] font-black text-slate-700 uppercase vertical-text">Advantage</div>
          </div>

          <div className="w-full max-w-[620px] flex flex-col items-center gap-8">
            <div className="flex items-center justify-between w-full px-2">
               <div className="flex flex-col">
                 <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                   Board Replica <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                 </h3>
                 <span className="text-[10px] font-bold text-slate-600 uppercase">Synchronized with screen</span>
               </div>
               <button 
                 onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')}
                 className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 transition-all border border-slate-800"
               >
                 <Settings2 className="w-5 h-5" />
               </button>
            </div>

            <div className="w-full relative shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
              <ChessBoardDisplay 
                fen={currentFen} 
                bestMove={engineResult?.moves[0]?.san} 
                lastOpponentMove={lastOpponentMove}
                orientation={boardOrientation} 
                onManualMove={handleManualMove} 
              />
              <div className="absolute -top-3 -left-3 w-8 h-8 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-lg" />
              <div className="absolute -top-3 -right-3 w-8 h-8 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-lg" />
              <div className="absolute -bottom-3 -left-3 w-8 h-8 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-lg" />
              <div className="absolute -bottom-3 -right-3 w-8 h-8 border-b-2 border-r-2 border-emerald-500/30 rounded-br-lg" />
            </div>

            <div className="w-full flex justify-between items-center text-[10px] font-mono text-slate-600">
              <div className="bg-black/40 px-4 py-2 rounded-lg border border-white/5 truncate max-w-[80%]">
                Current FEN: {currentFen}
              </div>
              <div className="flex items-center gap-2 text-emerald-500/40 font-black uppercase tracking-[0.2em]">
                <ShieldCheck className="w-3.5 h-3.5" /> Security: Local Wasm Engine
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
