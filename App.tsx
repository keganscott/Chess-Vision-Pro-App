
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Zap, Activity, Settings2, Target, Clock, 
  ShieldCheck, ChevronRight, Scan, RefreshCcw, Trophy,
  AlertTriangle, CheckCircle2, Maximize2
} from 'lucide-react';
import { Chess } from 'chess.js';
import CameraFeed from './components/CameraFeed';
import ChessBoardDisplay from './components/ChessBoardDisplay';
import { engine, EngineResult } from './services/engineService';
import { analyzeBoardVision } from './services/visionService';
import { INITIAL_FEN } from './types';

/**
 * CHESSVISIONX PRO HUD
 */

export default function App() {
  const [currentFen, setCurrentFen] = useState(INITIAL_FEN);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [isVisionSyncing, setIsVisionSyncing] = useState(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);
  const [lastVisionError, setLastVisionError] = useState<string | null>(null);
  const [visionSuccessCount, setVisionSuccessCount] = useState(0);
  
  const [lastOpponentMove, setLastOpponentMove] = useState<{ from: string; to: string } | null>(null);
  
  const gameRef = useRef(new Chess(INITIAL_FEN));
  const visionCooldown = useRef<boolean>(false);

  // Determine if it's the local user's turn
  const isUserTurn = useCallback(() => {
    const fenParts = currentFen.split(' ');
    const turn = fenParts[1] || 'w'; 
    return (turn === 'w' && boardOrientation === 'white') || 
           (turn === 'b' && boardOrientation === 'black');
  }, [currentFen, boardOrientation]);

  /**
   * Detects the move made between two FEN strings
   */
  const detectMove = (oldFen: string, newFen: string) => {
    try {
        const tempGame = new Chess(oldFen);
        const oldPos = oldFen.split(' ')[0];
        const newPos = newFen.split(' ')[0];
        
        if (oldPos === newPos) return null;

        const moves = tempGame.moves({ verbose: true });
        for (const move of moves) {
          tempGame.move(move);
          if (tempGame.fen().split(' ')[0] === newPos) {
            return { from: move.from, to: move.to };
          }
          tempGame.undo();
        }
    } catch (e) {}
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
      
      if (result.error) {
        setLastVisionError(result.error);
        return;
      }

      setLastVisionError(null);
      setVisionSuccessCount(prev => prev + 1);

      // Perspective Sync
      if (result.bottomColor !== boardOrientation) {
        setBoardOrientation(result.bottomColor);
      }

      // Position Sync
      const newBaseFen = result.fen.split(' ')[0];
      const currentBaseFen = currentFen.split(' ')[0];

      if (newBaseFen !== currentBaseFen) {
        const move = detectMove(currentFen, result.fen);
        const newTurn = result.fen.split(' ')[1] || 'w';
        const isNowUserTurn = (newTurn === 'w' && result.bottomColor === 'white') || 
                              (newTurn === 'b' && result.bottomColor === 'black');
        
        if (move && isNowUserTurn) {
          setLastOpponentMove(move);
        } else {
          setLastOpponentMove(null);
        }

        setCurrentFen(result.fen);
        gameRef.current = new Chess(result.fen);
      }
    } catch (e: any) {
      setLastVisionError(e.message || "Vision engine disconnected.");
    } finally {
      setIsVisionSyncing(false);
      // Wait 2.5s before next sync for high stability
      setTimeout(() => { visionCooldown.current = false; }, 2500);
    }
  }, [currentFen, boardOrientation, isAutoSyncEnabled]);

  /**
   * ENGINE CALCULATION (MAGNUS 2.6)
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
        setLastOpponentMove(null);
      }
    } catch (e) {}
  };

  const handleReset = () => {
    gameRef.current = new Chess(INITIAL_FEN);
    setCurrentFen(INITIAL_FEN);
    setEngineResult(null);
    setLastOpponentMove(null);
    setLastVisionError(null);
    setVisionSuccessCount(0);
  };

  const boardMoves = engineResult?.moves.map(m => ({ 
    from: m.from.toLowerCase(), 
    to: m.to.toLowerCase() 
  })) || [];

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* BRANDED HEADER */}
      <header className="h-14 glass flex items-center justify-between px-6 border-b border-white/5 relative z-50">
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-blue-500 rounded-md shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <Zap className="w-4 h-4 text-white fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter uppercase text-white">ChessVisionX</h1>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">
                Processor: Magnus Intelligence 2.6
              </span>
              <div className={`w-1.5 h-1.5 rounded-full ${isVisionSyncing ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-[10px] font-mono text-slate-500">
           <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
             <Activity className="w-3 h-3 text-blue-500/70" />
             <span>NODES: {(engineResult?.nodes || 0).toLocaleString()}</span>
           </div>
           <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
             <RefreshCcw className={`w-3 h-3 text-emerald-500/70 ${isVisionSyncing ? 'animate-spin' : ''}`} />
             <span>SYNC: AUTO-OPTIMIZED</span>
           </div>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-12 gap-8 overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] scale-150" />

        {/* SIDEBAR PANEL */}
        <div className="col-span-4 flex flex-col gap-6 overflow-hidden">
          {/* SCREEN PREVIEW */}
          <div className="relative aspect-video glass rounded-2xl overflow-hidden shadow-2xl border border-slate-800/50 group">
             <CameraFeed 
               isAnalyzing={isAutoSyncEnabled} 
               onCaptureFrame={handleFrameCapture} 
               onStreamStatusChange={() => {}} 
             />
             <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2 py-1 bg-black/80 rounded-lg text-[9px] font-black text-slate-300 border border-white/5 uppercase">
               <Scan className={`w-3.5 h-3.5 ${isVisionSyncing ? 'text-blue-400 animate-pulse' : 'text-emerald-500'}`} />
               {isVisionSyncing ? 'Locking Position...' : 'Scanning Game...'}
             </div>
             <div className="absolute inset-0 border-2 border-blue-500/0 group-hover:border-blue-500/20 transition-all pointer-events-none" />
          </div>

          {/* ENGINE OUTPUT */}
          <div className="flex-1 glass rounded-2xl p-6 flex flex-col gap-5 overflow-hidden shadow-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-white/5 pb-4">
               <div className="flex items-center gap-2">
                 <Trophy className="w-4 h-4 text-blue-400" />
                 <h2 className="text-xs font-black uppercase tracking-widest text-white">Magnus Strategy</h2>
               </div>
               {isEngineThinking && <div className="text-[9px] font-bold text-blue-400 animate-pulse uppercase">Thinking...</div>}
             </div>

             <div className="flex-1 flex flex-col gap-4 py-2 overflow-y-auto custom-scrollbar">
               {engineResult?.moves && engineResult.moves.length > 0 ? (
                 engineResult.moves.map((move, idx) => (
                   <div key={idx} className={`p-5 rounded-2xl border-2 transition-all ${idx === 0 ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.1)]' : 'bg-slate-900/40 border-slate-800'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                            {idx === 0 ? 'Optimal Line' : 'Alternative Path'}
                          </span>
                          <div className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                            {move.from} <ChevronRight className="w-4 h-4 text-slate-700" /> {move.to}
                          </div>
                        </div>
                        <div className={`text-lg font-black ${move.evaluation >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {move.evaluation > 0 ? '+' : ''}{move.evaluation.toFixed(2)}
                        </div>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-12 space-y-4 text-center">
                    <Maximize2 className="w-16 h-16 animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[180px]">
                      {isUserTurn() ? 'Analyzing Board Structure' : 'Waiting for Opponent Movement'}
                    </p>
                 </div>
               )}
             </div>

             {/* DIAGNOSTIC CONSOLE */}
             <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[9px] font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 uppercase font-black">System Diagnostics</span>
                  {lastVisionError ? <AlertTriangle className="w-3 h-3 text-rose-500" /> : <CheckCircle2 className="w-3 h-3 text-blue-500" />}
                </div>
                {lastVisionError ? (
                  <div className="text-rose-400 font-bold break-words leading-tight">ERROR: {lastVisionError}</div>
                ) : (
                  <div className="text-blue-400/80 font-bold">
                    SYNC STATUS: NOMINAL • {visionSuccessCount} SUCCESSFUL MAPS • {boardOrientation.toUpperCase()} PERSPECTIVE
                  </div>
                )}
             </div>

             {/* CONTROLS */}
             <div className="mt-auto flex items-center gap-4 pt-4 border-t border-white/5">
               <button onClick={handleReset} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-black uppercase border border-slate-800 text-slate-400">
                 Clear HUD
               </button>
               <button 
                onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                className={`flex-[2] py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg ${isAutoSyncEnabled ? 'bg-blue-600 text-white shadow-blue-900/20' : 'bg-slate-800 text-slate-400'}`}
               >
                 {isAutoSyncEnabled ? 'Live Sync Active' : 'Live Sync Paused'}
               </button>
             </div>
          </div>
        </div>

        {/* MAIN REPLICA DISPLAY */}
        <div className="col-span-8 flex items-center justify-center glass rounded-3xl p-10 border border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute left-10 top-1/2 -translate-y-1/2 h-[75%] flex flex-col items-center gap-3">
             <div className="w-2.5 h-full bg-slate-900/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/5">
                <div 
                  className="bg-blue-500 transition-all duration-1000 ease-in-out shadow-[0_0_20px_rgba(59,130,246,0.6)]" 
                  style={{ height: `${Math.max(5, Math.min(95, 50 + (engineResult?.moves[0]?.evaluation || 0) * 8))}%` }} 
                />
             </div>
             <div className="text-[8px] font-black text-slate-700 uppercase vertical-text">Advantage</div>
          </div>

          <div className="w-full max-w-[620px] flex flex-col items-center gap-8">
            <div className="flex items-center justify-between w-full px-2">
               <div className="flex flex-col">
                 <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                   Board Replica <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                 </h3>
                 <span className="text-[10px] font-bold text-slate-600 uppercase">Neural Mapping Active</span>
               </div>
               <div className="flex gap-2">
                 <button 
                   onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')}
                   className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 transition-all border border-slate-800"
                   title="Flip Orientation"
                 >
                   <Settings2 className="w-5 h-5" />
                 </button>
               </div>
            </div>

            {/* THE BOARD */}
            <div className="w-full relative shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
              <ChessBoardDisplay 
                fen={currentFen} 
                bestMoves={boardMoves} 
                lastOpponentMove={lastOpponentMove}
                orientation={boardOrientation} 
                onManualMove={handleManualMove} 
              />
              {/* CORNER ACCENTS */}
              <div className="absolute -top-3 -left-3 w-8 h-8 border-t-2 border-l-2 border-blue-500/30 rounded-tl-lg" />
              <div className="absolute -top-3 -right-3 w-8 h-8 border-t-2 border-r-2 border-blue-500/30 rounded-tr-lg" />
              <div className="absolute -bottom-3 -left-3 w-8 h-8 border-b-2 border-l-2 border-blue-500/30 rounded-bl-lg" />
              <div className="absolute -bottom-3 -right-3 w-8 h-8 border-b-2 border-r-2 border-blue-500/30 rounded-br-lg" />
            </div>

            <div className="w-full flex justify-between items-center text-[10px] font-mono text-slate-600">
              <div className="bg-black/40 px-4 py-2 rounded-lg border border-white/5 truncate max-w-[80%]">
                MAPPING: {currentFen}
              </div>
              <div className="flex items-center gap-2 text-blue-500/40 font-black uppercase tracking-[0.2em]">
                <ShieldCheck className="w-3.5 h-3.5" /> SECURE TUNNEL
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
