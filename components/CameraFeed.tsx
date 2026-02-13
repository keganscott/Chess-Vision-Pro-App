
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor, AlertCircle, Maximize, Target } from 'lucide-react';

/**
 * SCREEN CAPTURE COMPONENT (SMART CROP)
 */

interface CameraFeedProps {
  onCaptureFrame: (blob: string) => void;
  isAnalyzing: boolean;
  onStreamStatusChange: (isStreaming: boolean) => void;
  crop?: { ymin: number; xmin: number; ymax: number; xmax: number } | null;
}

const CameraFeed: React.FC<CameraFeedProps> = ({ onCaptureFrame, isAnalyzing, onStreamStatusChange, crop }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startCapture = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Screen capture not supported in this browser.");
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as any,
        audio: false,
      });

      setStream(mediaStream);
      onStreamStatusChange(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }

      mediaStream.getVideoTracks()[0].onended = () => stopCapture();
    } catch (err: any) {
      setError(err.message || "Capture permission denied.");
      onStreamStatusChange(false);
    }
  };

  const stopCapture = useCallback(() => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
    onStreamStatusChange(false);
  }, [stream, onStreamStatusChange]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    
    if (ctx && videoRef.current.readyState >= 2) {
      const v = videoRef.current;
      const c = canvasRef.current;

      if (crop) {
        // Apply Smart Crop normalized coordinates (0-1000)
        const sx = (crop.xmin / 1000) * v.videoWidth;
        const sy = (crop.ymin / 1000) * v.videoHeight;
        const sw = ((crop.xmax - crop.xmin) / 1000) * v.videoWidth;
        const sh = ((crop.ymax - crop.ymin) / 1000) * v.videoHeight;

        c.width = 640;
        c.height = 640;
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      } else {
        const scale = 0.5;
        c.width = v.videoWidth * scale;
        c.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, c.width, c.height);
      }
      
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      if (base64) onCaptureFrame(base64);
    }
  }, [onCaptureFrame, stream, crop]);

  useEffect(() => {
    if (isAnalyzing && stream) {
      intervalRef.current = window.setInterval(captureFrame, 2500);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [isAnalyzing, stream, captureFrame]);

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
      <video 
        ref={videoRef} 
        className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-700 ${stream && !crop ? 'opacity-40' : 'opacity-0'}`} 
        muted 
        playsInline 
      />
      
      {/* Visual Indicator of the Cropped Board */}
      {stream && crop && (
         <div className="relative w-full h-full flex items-center justify-center p-4">
            <canvas ref={canvasRef} className="w-full h-full max-w-full max-h-full object-contain rounded-lg border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.2)]" />
            <div className="absolute top-6 right-6 px-3 py-1 bg-blue-600/90 rounded text-[8px] font-black text-white uppercase flex items-center gap-1.5 shadow-lg">
               <Target className="w-3 h-3" /> Focus Locked
            </div>
         </div>
      )}
      
      {!crop && <canvas ref={canvasRef} className="hidden" />}
      
      {!stream && (
        <div className="text-center p-8 z-10">
           <Monitor className={`w-14 h-14 mb-8 mx-auto transition-all ${error ? 'text-rose-500 animate-pulse' : 'text-blue-500 opacity-40'}`} />
           
           {error && (
             <div className="mb-6 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-[10px] font-bold uppercase">
               <AlertCircle className="w-3.5 h-3.5" />
               {error}
             </div>
           )}

           <button 
             onClick={startCapture} 
             className="px-10 py-5 bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-blue-500 active:scale-95 transition-all shadow-2xl shadow-blue-900/40 border border-blue-400/20"
           >
             Initialize Feed
           </button>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
