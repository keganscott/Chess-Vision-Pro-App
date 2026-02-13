
import React, { useMemo, useState, useEffect } from 'react';
import { Chess, Square } from 'chess.js';

/**
 * CHESS BOARD REPLICA COMPONENT (HUD OPTIMIZED)
 */

interface ChessBoardDisplayProps {
  fen: string;
  bestMoves?: { from: string; to: string }[];
  lastOpponentMove?: { from: string; to: string } | null;
  orientation?: 'white' | 'black';
  onManualMove?: (from: string, to: string) => void;
}

const PIECE_IMAGES: Record<string, string> = {
  'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
};

const ChessBoardDisplay: React.FC<ChessBoardDisplayProps> = ({ 
  fen, 
  bestMoves = [], 
  lastOpponentMove,
  orientation = 'white', 
  onManualMove 
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch (e) {
      return new Chess();
    }
  }, [fen]);

  const handleSquareClick = (squareId: string) => {
    if (!onManualMove) return;
    if (selectedSquare && possibleMoves.includes(squareId)) {
      onManualMove(selectedSquare, squareId);
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }
    const piece = game.get(squareId as Square);
    if (piece) {
        const moves = game.moves({ square: squareId as Square, verbose: true });
        setSelectedSquare(squareId);
        setPossibleMoves(moves.map(m => m.to));
    } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
    }
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const displayFiles = orientation === 'white' ? files : [...files].reverse();
  const displayRanks = orientation === 'white' ? ranks : [...ranks].reverse();

  return (
    <div className="aspect-square w-full bg-slate-900 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[8px] border-slate-800 select-none">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full relative">
        {displayRanks.map((rank, rankIndex) => (
          displayFiles.map((file, fileIndex) => {
            const isLight = (rankIndex + fileIndex) % 2 === 0;
            const squareId = `${file}${rank}`;
            const piece = game.get(squareId as Square);

            // BRIGHT Move #1
            const isBestMove1From = bestMoves[0]?.from === squareId;
            const isBestMove1To = bestMoves[0]?.to === squareId;

            // DIM Move #2
            const isBestMove2From = bestMoves[1]?.from === squareId;
            const isBestMove2To = bestMoves[1]?.to === squareId;
            
            // Enemy Intensity Logic
            const isEnemyFrom = lastOpponentMove?.from === squareId; // DIM
            const isEnemyTo = lastOpponentMove?.to === squareId;     // BRIGHT

            const isSelected = selectedSquare === squareId;
            const isPossibleMove = possibleMoves.includes(squareId);

            return (
              <div 
                key={squareId} 
                className={`${isLight ? 'bg-[#334155]' : 'bg-[#1e293b]'} relative flex items-center justify-center cursor-pointer transition-all duration-300`}
                onClick={() => handleSquareClick(squareId)}
              >
                {/* BEST MOVE #1 (BRIGHT) */}
                {isBestMove1From && <div className="absolute inset-0 bg-emerald-400/20" />}
                {isBestMove1To && <div className="absolute inset-0 bg-emerald-500/60 shadow-[inset_0_0_20px_rgba(16,185,129,0.8)] border-2 border-emerald-400 animate-pulse z-10" />}

                {/* BEST MOVE #2 (DIM) */}
                {isBestMove2From && <div className="absolute inset-0 bg-emerald-900/20" />}
                {isBestMove2To && <div className="absolute inset-0 bg-emerald-800/30 border border-emerald-500/20 z-10" />}
                
                {/* ENEMY MOVE (DIM FROM, BRIGHT TO) */}
                {isEnemyFrom && <div className="absolute inset-0 bg-rose-900/10" />}
                {isEnemyTo && <div className="absolute inset-0 bg-rose-500/40 shadow-[inset_0_0_15px_rgba(244,63,94,0.6)] border border-rose-400/50 z-10" />}
                
                {isSelected && <div className="absolute inset-0 bg-amber-500/30 border border-amber-400/40" />}
                {isPossibleMove && <div className="absolute w-2 h-2 bg-white/20 rounded-full" />}

                {/* Coordinates */}
                {fileIndex === 0 && <span className="absolute top-0.5 left-1 text-[7px] font-black text-slate-500 opacity-30">{rank}</span>}
                {rankIndex === 7 && <span className="absolute bottom-0.5 right-1 text-[7px] font-black text-slate-500 opacity-30">{file.toUpperCase()}</span>}

                {/* Pieces */}
                {piece && (
                  <img 
                    src={PIECE_IMAGES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]} 
                    alt={piece.type} 
                    className="w-[85%] h-[85%] object-contain z-20 pointer-events-none drop-shadow-lg"
                  />
                )}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
};

export default ChessBoardDisplay;
