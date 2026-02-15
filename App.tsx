
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Zap, Activity, Settings2, ShieldCheck, ChevronRight, Scan, RefreshCcw, Trophy,
  AlertTriangle, CheckCircle2, Maximize2, Crop, Key, Target, MousePointer2, Timer,
  TrendingUp, UserCheck, Sword, Crosshair, Flame
} from 'lucide-react';
import { Chess } from 'chess.js';
import CameraFeed from './components/CameraFeed';
import ChessBoardDisplay from './components/ChessBoardDisplay';
import { engine, EngineResult } from './services/engineService';
import { analyzeBoardVision } from './services/visionService';
import { INITIAL_FEN } from './types';

/**
 * CHESSVISIONX - Magnus Intelligence 3.6 (ASSAULT EDITION)
 * STRATEGY: High-Complexity Tactical Aggression
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
  const [activeCrop, setActiveCrop] = useState<{ ymin: number; xmin: number; ymax: number; xmax: number } | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [lastLatency, setLastLatency] = useState<number>(0);
  
  const [lastOpponentMove, setLastOpponentMove] = useState<{ from: string; to: string } | null>(null);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(0);
  
  // ELO Estimator State
  const [estimatedElo, setEstimatedElo] = useState(800);
  const [eloStability, setEloStability] = useState(0); 
  const opponentMoveAccuracy = useRef<number[]>([]);
  
  const [manualOverrideActive, setManualOverrideActive] = useState(false);
  const manualPauseTimer = useRef<number | null>(null);
  const gameRef = useRef(new Chess(INITIAL_FEN));
  
  const visionInFlight = useRef(false);
  const previousEngineBestMove = useRef<{ from: string, to: string } | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (typeof window !== 'undefined' && window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleConnectKey = async () => {
    if (typeof window !== 'undefined' && window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setLastVisionError(null);
    }
  };

  const isUserTurn = useCallback(() => {
    const turn = currentFen.split(' ')[1] || 'w'; 
    return (turn === 'w' && boardOrientation === 'white') || 
           (turn === 'b' && boardOrientation === 'black');
  }, [currentFen, boardOrientation]);

  const handleFrameCapture = useCallback(async (base64: string) => {
    if (visionInFlight.current || !isAutoSyncEnabled || manualOverrideActive) return;
    
    visionInFlight.current = true;
    setIsVisionSyncing(true);
    const startTime = Date.now();

    try {
      const result = await analyzeBoardVision(base64, !!activeCrop);
      
      if (result.error) {
        setLastVisionError(result.error);
        if (result.error.toLowerCase().includes("api key")) setHasKey(false);
        return;
      }

      setLastLatency(Date.now() - startTime);
      setLastVisionError(null);
      setVisionSuccessCount(prev => prev + 1);

      if (result.bottomColor !== boardOrientation) setBoardOrientation(result.bottomColor);
      if (result.boundingBox && !activeCrop) setActiveCrop(result.boundingBox);

      const newPieces = result.fen.split(' ')[0];
      const currentPieces = currentFen.split(' ')[0];

      if (newPieces !== currentPieces) {
        const oldGame = new Chess(currentFen);
        const wasOpponentTurn = 
           (oldGame.turn() === 'b' && boardOrientation === 'white') || 
           (oldGame.turn() === 'w' && boardOrientation === 'black');

        const moves = oldGame.moves({ verbose: true });
        let moveForHighlight = null;
        
        for (const m of moves) {
           oldGame.move(m);
           if (oldGame.fen().split(' ')[0] === newPieces) {
             moveForHighlight = { from: m.from, to: m.to };
             break;
           }
           oldGame.undo();
        }

        if (wasOpponentTurn && moveForHighlight && previousEngineBestMove.current) {
          const pred = previousEngineBestMove.current;
          const isTopEngine = pred.from === moveForHighlight.from && pred.to === moveForHighlight.to;
          opponentMoveAccuracy.current.push(isTopEngine ? 100 : 0);
          const avgAcc = opponentMoveAccuracy.current.reduce((a,b) => a+b, 0) / opponentMoveAccuracy.current.length;
          setEstimatedElo(Math.round(800 + (avgAcc * 22)));
          setEloStability(Math.min(100, opponentMoveAccuracy.current.length * 10));
        }

        setCurrentFen(result.fen);
        gameRef.current.load(result.fen);
        setLastSyncTimestamp(Date.now());
        
        const newTurn = result.fen.split(' ')[1] || 'w';
        const isNowOurTurn = (newTurn === 'w' && result.bottomColor === 'white') || 
                             (newTurn === 'b' && result.bottomColor === 'black');
        
        if (isNowOurTurn && moveForHighlight) setLastOpponentMove(moveForHighlight);
      }
    } catch (e: any) {
      setLastVisionError("Sync collision");
    } finally {
      setIsVisionSyncing(false);
      visionInFlight.current = false;
    }
  }, [currentFen, boardOrientation, isAutoSyncEnabled, activeCrop, manualOverrideActive]);

  useEffect(() => {
    setIsEngineThinking(true);
    engine.analyze(currentFen, (res) => {
      if (res.fen === currentFen) {
        setEngineResult(res);
        setIsEngineThinking(false);
        if (res.moves.length > 0) {
          previousEngineBestMove.current = { 
            from: res.moves[0].from.toLowerCase(), 
            to: res.moves[0].to.toLowerCase() 
          };
        }
      }
    });
  }, [currentFen]);

  const handleManualMove = (from: string, to: string) => {
    try {
      const move = gameRef.current.move({ from, to, promotion: 'q' });
      if (move) {
        setCurrentFen(gameRef.current.fen());
        setLastOpponentMove(null);
        setManualOverrideActive(true);
        if (manualPauseTimer.current) window.clearTimeout(manualPauseTimer.current);
        manualPauseTimer.current = window.setTimeout(() => setManualOverrideActive(false), 8000); 
      }
    } catch (e) {}
  };

  const handleReset = () => {
    gameRef.current = new Chess(INITIAL_FEN);
    setCurrentFen(INITIAL_FEN);
    setEngineResult(null);
    setLastOpponentMove(null);
    setVisionSuccessCount(0);
    setActiveCrop(null);
    setManualOverrideActive(false);
    setEstimatedElo(800);
    setEloStability(0);
    opponentMoveAccuracy.current = [];
  };

  const boardMoves = engineResult?.moves.map(m => ({ 
    from: m.from.toLowerCase(), 
    to: m.to.toLowerCase() 
  })) || [];

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      <header className="h-14 glass flex items-center justify-between px-6 border-b border-white/5 relative z-50">
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-rose-600 rounded-md shadow-[0_0_20px_rgba(225,29,72,0.4)]">
            <Sword className="w-4 h-4 text-white fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter uppercase text-white">ChessVisionX</h1>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                Assault Mode 3.6 <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {!hasKey && (
            <button onClick={handleConnectKey} className="px-4 py-1.5 bg-amber-500 text-slate-950 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 hover:bg-amber-400 transition-all shadow-lg animate-bounce">
              <Key className="w-3.5 h-3.5" /> Connect Key
            </button>
          )}
          <div className="flex items-center gap-6 text-[10px] font-mono text-slate-500">
             <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
               <Timer className="w-3 h-3 text-rose-500/70" />
               <span>TURBO: {lastLatency}ms</span>
             </div>
             <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
               <RefreshCcw className={`w-3 h-3 text-rose-500/70 ${isVisionSyncing ? 'animate-spin' : ''}`} />
               <span>LIVE ASSAULT</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-10 overflow-hidden relative">
        <div className="col-span-4 p-6 flex flex-col gap-6 overflow-hidden border-r border-white/5 bg-slate-900/20">
          <div className="relative aspect-video glass rounded-2xl overflow-hidden shadow-2xl border border-white/5 group">
             <CameraFeed 
               isAnalyzing={isAutoSyncEnabled && !manualOverrideActive} 
               onCaptureFrame={handleFrameCapture} 
               onStreamStatusChange={() => {}} 
               crop={activeCrop}
             />
             <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2 py-1 bg-black/80 rounded-lg text-[9px] font-black text-slate-300 border border-white/5 uppercase">
               <Crosshair className={`w-3.5 h-3.5 ${isVisionSyncing ? 'text-rose-400 animate-pulse' : 'text-rose-600'}`} />
               Aggression Matrix
             </div>
          </div>

          <div className="flex-1 glass rounded-2xl p-6 flex flex-col gap-5 overflow-hidden shadow-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-white/5 pb-4">
               <div className="flex items-center gap-2">
                 <Flame className="w-4 h-4 text-rose-400" />
                 <h2 className="text-xs font-black uppercase tracking-widest text-white">Assault Sequence</h2>
               </div>
               {isEngineThinking && <div className="text-[9px] font-bold text-rose-400 animate-pulse uppercase tracking-widest">Seeking Mate...</div>}
             </div>

             <div className="flex-1 flex flex-col gap-3 py-2 overflow-y-auto custom-scrollbar">
               {engineResult?.moves && engineResult.moves.length > 0 ? (
                 engineResult.moves.map((move, idx) => (
                   <div key={idx} className={`p-4 rounded-2xl border-2 transition-all group hover:scale-[1.01] ${idx === 0 ? (isUserTurn() ? 'bg-rose-600/10 border-rose-600/40 shadow-[0_0_20px_rgba(225,29,72,0.1)]' : 'bg-rose-900/10 border-rose-800/40') : 'bg-slate-900/40 border-slate-800/60'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${idx === 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                            #{idx + 1} {isUserTurn() ? 'Kill Shot' : 'Critical Threat'}
                          </span>
                          <div className="text-2xl font-black text-white tracking-tighter flex items-center gap-3">
                            <span className="bg-slate-800 px-2 rounded border border-white/5">{move.from}</span>
                            <ChevronRight className={`w-4 h-4 ${idx === 0 ? 'text-rose-500' : 'text-slate-700'}`} />
                            <span className="bg-slate-800 px-2 rounded border border-white/5">{move.to}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Decisiveness</span>
                          <div className={`text-3xl font-black tabular-nums tracking-tighter ${idx === 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {move.confidence}%
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${idx === 0 ? 'bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-slate-800'}`} style={{ width: `${move.confidence}%` }} />
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-12 space-y-4 text-center">
                    <Target className="w-16 h-16 animate-pulse text-rose-500" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[180px]">Locked On...</p>
                 </div>
               )}
             </div>

             <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[9px] font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 uppercase font-black tracking-tighter">Assault Log 3.6</span>
                  {lastVisionError ? <AlertTriangle className="w-3 h-3 text-rose-500" /> : <CheckCircle2 className="w-3 h-3 text-rose-500" />}
                </div>
                {lastVisionError ? (
                  <div className="text-rose-400 font-bold break-words leading-tight p-1 bg-rose-500/5 rounded truncate">ASSAULT_ERR: {lastVisionError}</div>
                ) : (
                  <div className="text-rose-400/80 font-bold uppercase tracking-widest">Bridged • Aggression Confirmed • {lastLatency}ms</div>
                )}
             </div>

             <div className="mt-auto flex items-center gap-4 pt-4 border-t border-white/5">
               <button onClick={handleReset} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-black uppercase border border-slate-800 text-slate-400 transition-colors">Reset</button>
               <button onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)} className={`flex-[2] py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg ${isAutoSyncEnabled ? 'bg-rose-600 text-white shadow-rose-900/40' : 'bg-slate-800 text-slate-400'}`}>
                 {isAutoSyncEnabled ? 'Assault Sync: On' : 'Assault Sync: Off'}
               </button>
             </div>
          </div>
        </div>

        <div className="col-span-6 flex flex-col items-center justify-center p-12 relative overflow-hidden">
          {/* Tactical Bias Gauge */}
          <div className="absolute left-16 top-1/2 -translate-y-1/2 h-[65%] flex flex-col items-center gap-3">
             <div className="w-3.5 h-full bg-slate-900/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/10 p-[2px]">
                <div className="bg-rose-500 transition-all duration-1000 ease-in-out shadow-[0_0_20px_rgba(225,29,72,0.6)] rounded-full" style={{ height: `${Math.max(5, Math.min(95, 50 + (engineResult?.moves[0]?.evaluation || 0) * 8))}%` }} />
             </div>
             <div className="text-[8px] font-black text-slate-600 uppercase vertical-text tracking-[0.3em]">Game Bias</div>
          </div>

          <div className="w-full max-w-[720px] flex flex-col items-center gap-8">
            <div className="flex items-center justify-between w-full px-4">
               <div className="flex flex-col">
                 <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-3">
                   Assault Board v3.6 <div className={`w-2 h-2 rounded-full ${isVisionSyncing ? 'bg-rose-400 animate-ping' : 'bg-rose-500 shadow-[0_0_15px_rgba(225,29,72,1)]'}`} />
                 </h3>
                 <span className="text-[10px] font-bold text-slate-600 uppercase">Aggressive Pursuit Active</span>
               </div>
               <div className="flex gap-3">
                 {manualOverrideActive && (
                   <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 rounded-lg text-amber-500 text-[10px] font-black uppercase border border-amber-500/30 animate-pulse">
                     <MousePointer2 className="w-3 h-3" /> Manual
                   </div>
                 )}
                 <button onClick={() => setActiveCrop(null)} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 border border-slate-800 shadow-xl"><Crop className="w-5 h-5" /></button>
                 <button onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 border border-slate-800 shadow-xl"><Settings2 className="w-5 h-5" /></button>
               </div>
            </div>

            <div className={`w-full relative shadow-[0_60px_160px_rgba(0,0,0,1)] group transition-all duration-300 ${Date.now() - lastSyncTimestamp < 300 ? 'scale-[1.01]' : 'scale-100'}`}>
              <ChessBoardDisplay fen={currentFen} bestMoves={boardMoves} lastOpponentMove={lastOpponentMove} orientation={boardOrientation} onManualMove={handleManualMove} />
              <div className={`absolute -inset-2 border-2 rounded-2xl transition-all duration-200 pointer-events-none ${isVisionSyncing ? 'border-rose-500/30' : 'border-transparent'}`} />
              <div className={`absolute inset-0 bg-rose-500/5 pointer-events-none transition-opacity duration-200 rounded-xl ${Date.now() - lastSyncTimestamp < 300 ? 'opacity-100' : 'opacity-0'}`} />
            </div>

            {/* --- LIVE ELO ESTIMATOR TOOL --- */}
            <div className="w-full flex justify-between items-center relative">
              <div className="flex items-center gap-6">
                <div className="bg-black/60 px-5 py-2.5 rounded-xl border border-white/5 truncate max-w-[200px] text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest">
                  Matrix: {currentFen.split(' ')[0].slice(0, 10)}...
                </div>
                
                <div className="flex items-center gap-3 bg-slate-900/60 px-4 py-2 rounded-xl border border-white/10 shadow-xl group/elo">
                   <div className="p-1.5 bg-rose-600/20 rounded-lg text-rose-400">
                      <TrendingUp className="w-4 h-4" />
                   </div>
                   <div className="flex flex-col leading-none pr-2 border-r border-white/5">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Target ELO</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-white tabular-nums tracking-tighter">{estimatedElo}</span>
                        <span className="text-[8px] font-bold text-rose-500">EST.</span>
                      </div>
                   </div>
                   <div className="flex flex-col leading-none pl-1">
                      <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Stability</span>
                      <div className="flex items-center gap-1.5">
                         <div className="w-8 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${eloStability}%` }} />
                         </div>
                         <span className="text-[9px] font-bold text-slate-500">{eloStability}%</span>
                      </div>
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-rose-500/30 font-black uppercase tracking-[0.2em] text-[10px] font-mono">
                <UserCheck className="w-4 h-4" /> TACTICAL_ASSAULT_ACTIVE
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
