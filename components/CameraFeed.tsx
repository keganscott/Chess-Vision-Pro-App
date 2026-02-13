
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor } from 'lucide-react';

/**
 * SCREEN CAPTURE COMPONENT
 * PURPOSE: Obtains permission to capture the user's browser/screen.
 * FLOW:
 * 1. User clicks "Authorize Screen Link".
 * 2. Browser triggers DisplayMedia API.
 * 3. Video stream is rendered to a hidden canvas.
 * 4. Every 2 seconds (Optimized), the canvas extracts a JPEG frame as Base64.
 * 5. Base64 is passed to the Vision Service for processing.
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
  const intervalRef = useRef<number | null>(null);

  const startCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", cursor: "always" } as any,
        audio: false,
      });
      setStream(mediaStream);
      onStreamStatusChange(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      mediaStream.getVideoTracks()[0].onended = () => stopCapture();
    } catch (err) {
      console.error("Screen Access Denied", err);
    }
  };

  const stopCapture = useCallback(() => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
    onStreamStatusChange(false);
  }, [stream, onStreamStatusChange]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx && videoRef.current.readyState >= 2) {
      // Capture at a slightly lower resolution for faster transmission/AI processing
      const scale = 0.75; 
      canvasRef.current.width = videoRef.current.videoWidth * scale;
      canvasRef.current.height = videoRef.current.videoHeight * scale;
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      onCaptureFrame(base64);
    }
  }, [onCaptureFrame, stream]);

  useEffect(() => {
    if (isAnalyzing && stream) {
      // Reduced interval to 2000ms for more frequent updates
      intervalRef.current = window.setInterval(captureFrame, 2000);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [isAnalyzing, stream, captureFrame]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-contain ${stream ? 'opacity-100' : 'opacity-0'}`} muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {!stream && (
        <div className="text-center p-6">
           <Monitor className="w-16 h-16 mb-6 text-emerald-500 mx-auto opacity-50" />
           <button onClick={startCapture} className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-full hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/50">
             Authorize Screen Link
           </button>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
