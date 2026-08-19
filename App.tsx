
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Zap, Activity, Settings2, ShieldCheck, ChevronRight, Scan, RefreshCcw, Trophy,
  AlertTriangle, CheckCircle2, Maximize2, Crop, Key, Target, MousePointer2, Timer,
  TrendingUp, UserCheck, Sword, Crosshair, Flame, ShieldAlert, Siren, FlipVertical,
  Smartphone, Monitor, Eye, Video, Layers, RotateCcw, Tablet
} from 'lucide-react';
import { Chess } from 'chess.js';
import CameraFeed from './components/CameraFeed';
import ChessBoardDisplay from './components/ChessBoardDisplay';
import { engine, EngineResult } from './services/engineService';
import { analyzeBoardVision } from './services/visionService';
import { INITIAL_FEN } from './types';

/**
 * MAGNUS ASSAULT 4.2 - DUAL DESKTOP & IPAD/MOBILE ENGINE
 * Adaptive interface featuring a dedicated iPad/Mobile view mode and full-scale desktop layout.
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

  // Mobile / iPad Layout State
  const [viewMode, setViewMode] = useState<'desktop' | 'ipad' | 'iphone'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('magnus_view_mode');
      if (saved === 'desktop' || saved === 'ipad' || saved === 'iphone') return saved;
      return window.innerWidth < 768 ? 'iphone' : window.innerWidth < 1024 ? 'ipad' : 'desktop';
    }
    return 'desktop';
  });

  const [mobileTab, setMobileTab] = useState<'board' | 'scanner' | 'vectors'>('board');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('magnus_view_mode', viewMode);
    }
  }, [viewMode]);

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

  const topMove = engineResult?.moves?.[0];

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      {/* HEADER */}
      <header className="h-14 glass flex items-center justify-between px-3 sm:px-6 border-b border-white/5 shrink-0 z-50">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="p-1.5 bg-rose-600 rounded-md shadow-[0_0_20px_rgba(225,29,72,0.4)] shrink-0">
            <Sword className="w-4 h-4 text-white fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xs sm:text-sm font-black tracking-tighter uppercase text-white whitespace-nowrap">Magnus Assault</h1>
            <span className="text-[8px] sm:text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                Neural Core v4.2 <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Mode Toggle Group */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 shrink-0 shadow-inner">
            <button 
              onClick={() => setViewMode('desktop')}
              className={`p-1.5 rounded-md text-[10px] flex items-center gap-1.5 transition-all ${
                viewMode === 'desktop' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="Desktop View"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden lg:inline font-bold uppercase">Desktop</span>
            </button>
            <button 
              onClick={() => setViewMode('ipad')}
              className={`p-1.5 rounded-md text-[10px] flex items-center gap-1.5 transition-all ${
                viewMode === 'ipad' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="iPad View"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden lg:inline font-bold uppercase">iPad</span>
            </button>
            <button 
              onClick={() => setViewMode('iphone')}
              className={`p-1.5 rounded-md text-[10px] flex items-center gap-1.5 transition-all ${
                viewMode === 'iphone' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title="iPhone View"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden lg:inline font-bold uppercase">iPhone</span>
            </button>
          </div>

          {!hasKey && (
            <button onClick={handleConnectKey} className="px-2.5 sm:px-3 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-rose-500 transition-all shadow-lg animate-bounce shrink-0">
              <Key className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Connect Key</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 sm:gap-3 text-[10px] font-mono text-slate-500">
             <div className="flex items-center gap-1 bg-slate-900/50 px-2 sm:px-3 py-1 rounded-full border border-slate-800 shrink-0">
               <Timer className="w-3 h-3 text-rose-500/70" />
               <span>{lastLatency}ms</span>
             </div>
             <div className="flex items-center gap-1 bg-slate-900/50 px-2 sm:px-3 py-1 rounded-full border border-slate-800 shrink-0">
               <RefreshCcw className={`w-3 h-3 text-rose-500/70 ${isVisionSyncing ? 'animate-spin' : ''}`} />
               <span className="hidden md:inline">SYNC</span>
             </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* IPAD & MOBILE VIEW MODE (Single screen with tabbed sections & fitted board) */}
      {/* ========================================================================= */}
      {viewMode !== 'desktop' ? (
        <div className={`flex-1 flex flex-col overflow-hidden bg-slate-950 mx-auto w-full ${viewMode === 'ipad' ? 'max-w-3xl border-x border-white/5 shadow-2xl' : ''}`}>
          
          {/* Mobile Tab Switcher */}
          <div className="bg-slate-900/90 border-b border-white/5 px-3 py-2 flex items-center justify-around gap-2 shrink-0 z-40">
            <button
              id="mobile-tab-board"
              onClick={() => setMobileTab('board')}
              className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'board'
                  ? 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Sword className="w-3.5 h-3.5" />
              <span>Chess Board</span>
              {topMove && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-rose-300 animate-pulse" />}
            </button>

            <button
              id="mobile-tab-scanner"
              onClick={() => setMobileTab('scanner')}
              className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'scanner'
                  ? 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Scanner Feed</span>
              {isVisionSyncing && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />}
            </button>

            <button
              id="mobile-tab-vectors"
              onClick={() => setMobileTab('vectors')}
              className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'vectors'
                  ? 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Vectors & ELO</span>
              {engineResult?.moves?.length ? (
                <span className="text-[9px] bg-slate-900 px-1.5 py-0.2 rounded-full text-rose-300 font-mono">
                  {engineResult.moves.length}
                </span>
              ) : null}
            </button>
          </div>

          {/* Mobile Tab Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 flex flex-col items-center">
            
            {/* TAB 1: BOARD VIEW */}
            {mobileTab === 'board' && (
              <div className="w-full max-w-lg flex flex-col items-center gap-3">
                
                {/* Top Tactical Alert Banner */}
                {topMove ? (
                  <div className="w-full bg-rose-600/15 border border-rose-500/40 rounded-xl p-2.5 flex items-center justify-between shadow-[0_0_15px_rgba(225,29,72,0.15)] shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-rose-600 rounded-md">
                        <Flame className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest leading-tight">
                          #{1} {isUserTurn() ? 'KILL VECTOR' : 'TOP THREAT'}
                        </span>
                        <div className="text-sm font-black text-white flex items-center gap-1.5">
                          <span className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-white/10 font-mono">{topMove.from}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-rose-500" />
                          <span className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-white/10 font-mono">{topMove.to}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-rose-400 leading-none">{topMove.confidence}%</div>
                      <span className="text-[8px] text-slate-400 font-bold uppercase">Confidence</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full bg-slate-900/40 border border-slate-800 rounded-xl p-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <div className="flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                      <span>{isVisionSyncing ? 'Synchronizing Neural Board...' : 'Awaiting Engine Vector Matrix'}</span>
                    </div>
                    <span className="text-[9px] text-rose-400 font-bold">{isUserTurn() ? 'Your Turn' : 'Opponent Turn'}</span>
                  </div>
                )}

                {/* Mobile Quick Action Buttons Bar */}
                <div className="w-full grid grid-cols-4 gap-2 shrink-0">
                  <button 
                    onClick={() => setBoardOrientation(p => p === 'white' ? 'black' : 'white')}
                    className="py-2 px-1 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-300 border border-slate-800 shadow-md flex items-center justify-center gap-1 text-[9px] font-black uppercase transition-colors"
                  >
                    <FlipVertical className="w-3.5 h-3.5 text-rose-400" />
                    <span>Flip</span>
                  </button>

                  <button 
                    onClick={() => setActiveCrop(null)}
                    className="py-2 px-1 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-300 border border-slate-800 shadow-md flex items-center justify-center gap-1 text-[9px] font-black uppercase transition-colors"
                  >
                    <Crop className="w-3.5 h-3.5 text-rose-400" />
                    <span>Crop</span>
                  </button>

                  <button 
                    onClick={handleReset}
                    className="py-2 px-1 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-300 border border-slate-800 shadow-md flex items-center justify-center gap-1 text-[9px] font-black uppercase transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reset</span>
                  </button>

                  <button 
                    onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                    className={`py-2 px-1 rounded-xl text-[9px] font-black uppercase shadow-md flex items-center justify-center gap-1 transition-all ${
                      isAutoSyncEnabled ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isAutoSyncEnabled && isVisionSyncing ? 'animate-spin' : ''}`} />
                    <span>{isAutoSyncEnabled ? 'Sync: ON' : 'Sync: OFF'}</span>
                  </button>
                </div>

                {/* Mobile Responsive Chess Board Container with Integrated Side Evaluation Meter */}
                <div className="w-full flex items-stretch justify-center gap-2 my-1">
                  
                  {/* Integrated Side Evaluation Meter */}
                  <div className="w-2.5 bg-slate-900 rounded-full overflow-hidden flex flex-col-reverse border border-white/10 p-[1px] shrink-0 my-1">
                    <div 
                      className="bg-rose-500 transition-all duration-700 shadow-[0_0_15px_rgba(225,29,72,0.6)] rounded-full w-full"
                      style={{ height: `${Math.max(5, Math.min(95, 50 + (engineResult?.moves[0]?.evaluation || 0) * 8))}%` }} 
                    />
                  </div>

                  {/* Adaptive Board Viewport */}
                  <div className="flex-1 aspect-square bg-slate-900 rounded-2xl overflow-hidden border-2 border-white/10 relative shadow-2xl max-w-[min(88vw,440px)] max-h-[min(88vw,440px)]">
                    <ChessBoardDisplay 
                      fen={currentFen} 
                      bestMoves={boardMoves} 
                      lastOpponentMove={lastOpponentMove} 
                      orientation={boardOrientation} 
                      onManualMove={handleManualMove} 
                    />
                    <div className={`absolute -inset-2 border-2 border-rose-500/20 rounded-2xl pointer-events-none transition-opacity duration-200 ${isVisionSyncing ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                </div>

                {/* Mobile Compact HUD Card (Opponent ELO & FEN status) */}
                <div className="w-full grid grid-cols-2 gap-2 shrink-0">
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 flex items-center gap-2.5">
                    <div className="p-2 bg-rose-600/20 rounded-lg text-rose-500 shrink-0">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Opponent ELO</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-white tabular-nums tracking-tight">{estimatedElo}</span>
                        <span className="text-[8px] font-bold text-rose-500 uppercase">Est.</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1">
                      <span>Stability</span>
                      <span className="text-rose-400 font-mono">{eloStability}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 transition-all duration-700" style={{ width: `${eloStability}%` }} />
                    </div>
                    <div className="text-[8px] font-mono text-slate-500 truncate mt-1">
                      {lastVisionError ? `ERR: ${lastVisionError}` : `Sync: ${visionSuccessCount} snaps`}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: SCANNER / CAMERA FEED */}
            {mobileTab === 'scanner' && (
              <div className="w-full max-w-lg flex flex-col gap-3">
                <div className="relative aspect-video w-full glass rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                  <CameraFeed 
                    isAnalyzing={isAutoSyncEnabled && !manualOverrideActive} 
                    onCaptureFrame={handleFrameCapture} 
                    onStreamStatusChange={() => {}} 
                    crop={activeCrop}
                    isSyncing={isVisionSyncing}
                  />
                  <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2 py-1 bg-black/80 rounded-lg text-[9px] font-black text-slate-300 border border-white/5 uppercase">
                    <Crosshair className={`w-3 h-3 ${isVisionSyncing ? 'text-rose-400 animate-pulse' : 'text-rose-600'}`} />
                    Precision Mode
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setActiveCrop(null)} 
                    className="py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-300 border border-slate-800 text-[10px] font-black uppercase flex items-center justify-center gap-1.5"
                  >
                    <Crop className="w-3.5 h-3.5 text-rose-400" /> Reset Crop
                  </button>

                  <button 
                    onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition-all ${
                      isAutoSyncEnabled ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isAutoSyncEnabled && isVisionSyncing ? 'animate-spin' : ''}`} />
                    {isAutoSyncEnabled ? 'Auto-Sync Active' : 'Auto-Sync Paused'}
                  </button>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 text-[10px] font-mono space-y-2">
                  <div className="flex items-center justify-between text-slate-400 uppercase font-black">
                    <span>Vision Bridge Status</span>
                    {lastVisionError ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />}
                  </div>
                  <div className="text-slate-300">
                    Orientation: <span className="text-rose-400 font-bold uppercase">{boardOrientation}</span>
                  </div>
                  <div className="text-slate-300">
                    Sync Snaps: <span className="text-rose-400 font-bold">{visionSuccessCount}</span>
                  </div>
                  <div className="text-slate-300 truncate">
                    Status: <span className="text-rose-400">{lastVisionError ? `ERR: ${lastVisionError}` : 'Locked and Broadcasting'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: AGGRESSION LINES & ANALYTICS */}
            {mobileTab === 'vectors' && (
              <div className="w-full max-w-lg flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-rose-500" />
                    <h2 className="text-xs font-black uppercase tracking-widest text-white">Aggression Lines</h2>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">{engineResult?.moves?.length || 0} Vectors Evaluated</span>
                </div>

                <div className="space-y-3">
                  {engineResult?.moves && engineResult.moves.length > 0 ? (
                    engineResult.moves.map((move, idx) => (
                      <div key={idx} className={`p-3.5 rounded-xl border-2 transition-all ${idx === 0 ? 'bg-rose-600/10 border-rose-500/40 shadow-[0_0_20px_rgba(225,29,72,0.1)]' : 'bg-slate-900/40 border-slate-800/60'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-slate-500 tracking-tight mb-1">
                              #{idx+1} {isUserTurn() ? 'KILL VECTOR' : 'THREAT VECTOR'}
                            </span>
                            <div className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                              <span className="bg-slate-800 px-2 py-0.5 rounded border border-white/5 font-mono">{move.from}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-rose-500" />
                              <span className="bg-slate-800 px-2 py-0.5 rounded border border-white/5 font-mono">{move.to}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-black text-rose-400 leading-none">{move.confidence}%</div>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Confidence</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 bg-slate-900/30 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center opacity-40">
                      <Target className="w-10 h-10 mb-2 animate-pulse text-rose-600" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Awaiting Engine Evaluation...</p>
                    </div>
                  )}
                </div>

                {/* Opponent Detailed ELO Card */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-rose-500/20 shadow-xl mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-rose-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opponent ELO Estimator</span>
                    </div>
                    <span className="text-lg font-black text-white tabular-nums">{estimatedElo}</span>
                  </div>

                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-rose-500 transition-all duration-700" style={{ width: `${eloStability}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>Sample Stability: {eloStability}%</span>
                    <span>Moves Evaluated: {opponentMoveAccuracy.current.length}</span>
                  </div>
                </div>

              </div>
            )}

            <div className="h-10 shrink-0" />
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* DESKTOP VIEW MODE (Full-size 2-column Magnus Assault Dashboard) */
        /* ========================================================================= */
        <main className="flex-1 flex overflow-hidden">
          {/* SIDEBAR: Left side with aggression lines & camera feed */}
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
          <div className="flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar p-6 sm:p-10 bg-slate-950/40">
            
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
      )}
    </div>
  );
}

