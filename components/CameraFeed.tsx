
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor, AlertCircle } from 'lucide-react';

/**
 * SCREEN CAPTURE COMPONENT (REFINED)
 * PURPOSE: Obtains permission to capture the user's browser/screen with robust error handling.
 */

interface CameraFeedProps {
  onCaptureFrame: (blob: string) => void;
  isAnalyzing: boolean;
  onStreamStatusChange: (isStreaming: boolean) => void;
}

const CameraFeed: React.FC<CameraFeedProps> = ({ onCaptureFrame, isAnalyzing, onStreamStatusChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startCapture = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Your browser does not support screen capture.");
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
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
      console.error("Screen Access Denied", err);
      setError(err.message || "Failed to access screen. Ensure you granted permissions.");
      onStreamStatusChange(false);
    }
  };

  const stopCapture = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setStream(null);
    onStreamStatusChange(false);
  }, [stream, onStreamStatusChange]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    
    if (ctx && videoRef.current.readyState >= 2) {
      const scale = 0.8; 
      canvasRef.current.width = videoRef.current.videoWidth * scale;
      canvasRef.current.height = videoRef.current.videoHeight * scale;
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Use toDataURL for conversion to base64
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      if (base64) {
        onCaptureFrame(base64);
      }
    }
  }, [onCaptureFrame, stream]);

  useEffect(() => {
    if (isAnalyzing && stream) {
      intervalRef.current = window.setInterval(captureFrame, 2000);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
    return () => { 
      if (intervalRef.current) window.clearInterval(intervalRef.current); 
    };
  }, [isAnalyzing, stream, captureFrame]);

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
      <video 
        ref={videoRef} 
        className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${stream ? 'opacity-100' : 'opacity-0'}`} 
        muted 
        playsInline 
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {!stream && (
        <div className="text-center p-6 z-10">
           <Monitor className={`w-12 h-12 mb-6 mx-auto transition-colors ${error ? 'text-rose-500' : 'text-emerald-500 opacity-50'}`} />
           
           {error && (
             <div className="mb-4 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
               <AlertCircle className="w-3 h-3" />
               {error}
             </div>
           )}

           <button 
             onClick={startCapture} 
             className="px-8 py-4 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-full hover:bg-emerald-500 active:scale-95 transition-all shadow-xl shadow-emerald-900/40"
           >
             Authorize Screen Link
           </button>
           
           <p className="mt-4 text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
             Requires secure connection & user permission
           </p>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
