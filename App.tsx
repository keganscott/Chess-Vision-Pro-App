
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Zap, Activity, Settings2, ShieldCheck, ChevronRight, Scan, RefreshCcw, Trophy,
  AlertTriangle, CheckCircle2, Maximize2, Crop, Key, Target, MousePointer2, Timer,
  TrendingUp, UserCheck, Sword, Crosshair, Flame, ShieldAlert, Siren, FlipVertical
} from 'lucide-react';
import { Chess } from 'chess.js';
import CameraFeed from './components/CameraFeed';
import ChessBoardDisplay from './components/ChessBoardDisplay';
import { engine, EngineResult } from './services/engineService';
import { analyzeBoardVision } from './services/visionService';
import { INITIAL_FEN } from './types';

/**
 * MAGNUS ASSAULT 4.2 - CLASSIC SCALE RESTORATION
 * Reverts board to original 720px width while maintaining laptop compatibility via smart overflow.
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
          setEloStability(Math.min(100, opponentMoveAccuracy.current.length * 8));
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
      setLastVisionError("Sync protection");
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
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* HEADER: Original Height */}
      <header className="h-14 glass flex items-center justify-between px-6 border-b border-white/5 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-rose-600 rounded-md shadow-[0_0_20px_rgba(225,29,72,0.4)]">
            <Sword className="w-4 h-4 text-white fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter uppercase text-white">Magnus Assault</h1>
            <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2 leading-none">
                Neural Core v4.2 <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {!hasKey && (
            <button onClick={handleConnectKey} className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-2 hover:bg-rose-500 transition-all shadow-lg animate-bounce">
              <Key className="w-3.5 h-3.5" /> Connect Key
            </button>
          )}
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
             <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
               <Timer className="w-3.5 h-3.5 text-rose-500/70" />
               <span>{lastLatency}ms</span>
             </div>
             <div className="flex items-center gap-1.5 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
               <RefreshCcw className={`w-3.5 h-3.5 text-rose-500/70 ${isVisionSyncing ? 'animate-spin' : ''}`} />
               <span className="hidden md:inline">ASSAULT_SYNC</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* SIDEBAR: Left side with aggression lines */}
        <div className="w-[320px] shrink-0 border-r border-white/5 bg-slate-900/20 flex flex-col overflow-hidden">
          <div className="p-5 flex flex-col gap-5 h-full">
            <div className="relative aspect-video shrink-0 glass rounded-2xl overflow-hidden shadow-2xl border border-white/5">
               <CameraFeed 
                 isAnalyzing={isAutoSyncEnabled && !manualOverrideActive} 
                 onCaptureFrame={handleFrameCapture} 
                 onStreamStatusChange={() => {}} 
                 crop={activeCrop}
                 isSyncing={isVisionSyncing}
               />
               <div className="absolute top-3 left-3 z-20 flex items-center gap-2 px-2 py-1 bg-black/80 rounded-lg text-[9px] font-black text-slate-300 border border-white/5 uppercase">
                 <Crosshair className={`w-3.5 h-3.5 ${isVisionSyncing ? 'text-rose-400 animate-pulse' : 'text-rose-600'}`} />
                 Precision
               </div>
            </div>

            {/* Aggression Lines Section: Always visible and scrollable */}
            <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden border border-white/5">
               <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-900/40">
                 <div className="flex items-center gap-2">
                   <Flame className="w-4 h-4 text-rose-500" />
                   <h2 className="text-xs font-black uppercase tracking-widest text-white">Aggression Lines</h2>
                 </div>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                 {engineResult?.moves && engineResult.moves.length > 0 ? (
                   engineResult.moves.map((move, idx) => (
                     <div key={idx} className={`p-4 rounded-xl border-2 transition-all ${idx === 0 ? 'bg-rose-600/10 border-rose-500/40 shadow-[0_0_20px_rgba(225,29,72,0.1)]' : 'bg-slate-900/40 border-slate-800/60'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-slate-500 tracking-tighter mb-1.5">#{idx+1} {isUserTurn() ? 'KILL VECTOR' : 'THREAT'}</span>
                            <div className="text-xl font-black text-white tracking-tighter flex items-center gap-3">
                              <span className="bg-slate-800 px-2 py-0.5 rounded border border-white/5">{move.from}</span>
                              <ChevronRight className="w-4 h-4 text-rose-500" />
                              <span className="bg-slate-800 px-2 py-0.5 rounded border border-white/5">{move.to}</span>
                            </div>
                          </div>
                          <div className="text-right">
                             <div className="text-2xl font-black text-rose-400 leading-none">{move.confidence}%</div>
                             <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">Confidence</span>
                          </div>
                        </div>
                     </div>
                   ))
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center opacity-20 text-center py-10">
                      <Target className="w-12 h-12 mb-4 animate-pulse text-rose-600" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] max-w-[150px]">Targeting Piece Matrix...</p>
                   </div>
                 )}
               </div>

               <div className="p-4 shrink-0 bg-black/40 border-t border-white/5 text-[10px] font-mono">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-slate-500 uppercase font-black tracking-widest">Bridge Log</span>
                   {lastVisionError ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />}
                 </div>
                 <div className="text-rose-500/80 font-bold uppercase truncate">
                   {lastVisionError ? `ERR: ${lastVisionError}` : `Sync Locked • ${visionSuccessCount} Snaps`}
                 </div>
               </div>
            </div>

            <div className="flex gap-3 shrink-0">
               <button onClick={handleReset} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-black uppercase border border-slate-800 text-slate-400 transition-colors">Reset</button>
               <button onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)} className={`flex-[2] py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg ${isAutoSyncEnabled ? 'bg-rose-600 text-white shadow-rose-900/40' : 'bg-slate-800 text-slate-400'}`}>
                 {isAutoSyncEnabled ? 'Sync: Enabled' : 'Sync: Paused'}
               </button>
            </div>
          </div>
        </div>

        {/* MAIN BOARD AREA: Allowed to scroll vertically to keep the board at full size */}
        <div className="flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar p-10 bg-slate-950/40">
          
          <div className="w-full max-w-[720px] flex flex-col items-center gap-8 min-h-full">
            
            {/* Action Row: Sticky at the top of the main area */}
            <div className="flex items-center justify-between w-full px-4 shrink-0">
               <div className="flex flex-col">
                 <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white flex items-center gap-3">
                   Assault Board v4.2 <div className={`w-2 h-2 rounded-full ${isVisionSyncing ? 'bg-rose-400 animate-ping' : 'bg-rose-500 shadow-[0_0_15px_rgba(225,29,72,1)]'}`} />
                 </h3>
                 <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Precision Matrix Engaged</span>
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-800 shadow-xl flex items-center gap-2 text-[10px] font-black uppercase">
                   <FlipVertical className="w-4 h-4" /> Flip Side
                 </button>
                 <button onClick={() => setActiveCrop(null)} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-800 shadow-xl flex items-center gap-2 text-[10px] font-black uppercase">
                   <Crop className="w-4 h-4" /> Reset View
                 </button>
               </div>
            </div>

            {/* Board Container: RESTORED TO ORIGINAL 720px WIDTH */}
            <div className="w-full relative shadow-[0_60px_160px_rgba(0,0,0,1)] group shrink-0">
               <div className="w-full aspect-square bg-slate-900 rounded-2xl overflow-hidden border-2 border-white/5 relative">
                  <ChessBoardDisplay fen={currentFen} bestMoves={boardMoves} lastOpponentMove={lastOpponentMove} orientation={boardOrientation} onManualMove={handleManualMove} />
                  <div className={`absolute -inset-2 border-2 border-rose-500/20 rounded-2xl pointer-events-none transition-opacity duration-200 ${isVisionSyncing ? 'opacity-100' : 'opacity-0'}`} />
               </div>
               
               {/* Side Evaluation Meter - Positioned relative to board */}
               <div className="absolute -left-12 top-0 bottom-0 w-2.5 bg-slate-900/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/10 p-[1px]">
                  <div className="bg-rose-500 transition-all duration-1000 shadow-[0_0_20px_rgba(225,29,72,0.6)] rounded-full" style={{ height: `${Math.max(5, Math.min(95, 50 + (engineResult?.moves[0]?.evaluation || 0) * 8))}%` }} />
               </div>
            </div>

            {/* HUD Area: Original ELO HUD restored beneath board */}
            <div className="w-full flex justify-between items-center py-6 shrink-0 gap-6">
                <div className="bg-black/60 px-6 py-4 rounded-2xl border border-white/5 truncate flex-1 text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest flex items-center gap-4">
                  <Activity className="w-4 h-4 text-rose-500/40" />
                  FEN_ID: {currentFen.split(' ')[0]}
                </div>
                
                <div className="flex items-center gap-5 bg-slate-900/60 px-6 py-4 rounded-2xl border border-rose-500/20 shadow-2xl relative min-w-[220px]">
                   <div className="p-2.5 bg-rose-600/20 rounded-xl text-rose-500 animate-pulse">
                      <TrendingUp className="w-5 h-5" />
                   </div>
                   <div className="flex flex-col leading-none pr-5 border-r border-white/5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Opponent ELO</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white tabular-nums tracking-tighter">{estimatedElo}</span>
                        <span className="text-[10px] font-bold text-rose-500 uppercase">Est.</span>
                      </div>
                   </div>
                   <div className="flex flex-col leading-none pl-2">
                      <span className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Stability</span>
                      <div className="flex items-center gap-2">
                         <div className="w-14 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${eloStability}%` }} />
                         </div>
                         <span className="text-[11px] font-black text-slate-500 tabular-nums">{eloStability}%</span>
                      </div>
                   </div>

                   {eloStability > 60 && estimatedElo > 2200 && (
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap animate-bounce border border-rose-400 shadow-[0_10px_30px_rgba(225,29,72,0.5)]">
                        <ShieldAlert className="w-4 h-4 inline mr-2" />
                        Neural Anomaly Detected
                      </div>
                   )}
                </div>

                <div className="hidden lg:flex items-center gap-3 text-rose-600/30 font-black uppercase text-[11px] font-mono tracking-widest">
                  <ShieldCheck className="w-6 h-6" /> BRIDGED_OK
                </div>
            </div>
            
            {/* Added bottom padding to ensure the scroll feels nice */}
            <div className="h-20 shrink-0" />
          </div>
        </div>
      </main>
    </div>
  );
}
