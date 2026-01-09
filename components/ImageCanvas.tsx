
import React, { useRef, useEffect, useState } from 'react';
import { TextRegion } from '../types';

interface ImageCanvasProps {
  imageUrl: string;
  regions: TextRegion[];
  onAddRegion: (region: Omit<TextRegion, 'id' | 'order'>) => void;
  onUpdateRegion: (id: string, updates: Partial<TextRegion>) => void;
  onRemoveRegion: (id: string) => void;
  selectedRegionId: string | null;
  onSelectRegion: (id: string | null) => void;
}

const ImageCanvas: React.FC<ImageCanvasProps> = ({
  imageUrl,
  regions,
  onAddRegion,
  onUpdateRegion,
  onRemoveRegion,
  selectedRegionId,
  onSelectRegion
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number, y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Mevcut bir kutucuğa tıklandığını kontrol et
    // Tolerans payı ekleyerek seçimi kolaylaştırıyoruz
    const clickedRegion = [...regions].sort((a,b) => b.order - a.order).find(r => 
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
    );
    
    if (clickedRegion) {
      onSelectRegion(clickedRegion.id);
      return;
    }

    onSelectRegion(null);
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCurrentRect({
      x: Math.min(x, startPos.x),
      y: Math.min(y, startPos.y),
      w: Math.abs(x - startPos.x),
      h: Math.abs(y - startPos.y)
    });
  };

  const handleMouseUp = () => {
    // Sınırı 1'den 0.05'e çektik (neredeyse görünmez kutulara izin verir)
    if (isDrawing && currentRect && currentRect.w > 0.05 && currentRect.h > 0.05) {
      onAddRegion({
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.w,
        height: currentRect.h,
        originalText: '',
        translatedText: ''
      });
    }
    setIsDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full overflow-hidden cursor-crosshair select-none bg-black rounded-lg shadow-2xl border border-slate-700"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img 
        src={imageUrl} 
        alt="Webtoon Panel" 
        className="w-full h-auto block"
        draggable={false}
      />
      
      {/* Mevcut Bölgeler */}
      {regions.map((region) => (
        <div
          key={region.id}
          className={`absolute border-2 transition-all flex items-center justify-center group ${
            selectedRegionId === region.id 
              ? 'border-blue-500 bg-blue-500/30 z-20 shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
              : 'border-yellow-400/80 bg-yellow-400/5 z-10 hover:bg-yellow-400/20'
          }`}
          style={{
            left: `${region.x}%`,
            top: `${region.y}%`,
            width: `${region.width}%`,
            height: `${region.height}%`,
          }}
        >
          <span className="absolute -top-5 -left-1 bg-slate-900 text-white text-[9px] px-1 rounded border border-slate-700 font-bold whitespace-nowrap shadow-lg">
            #{region.order}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onRemoveRegion(region.id); }}
            className="hidden group-hover:flex absolute -top-2 -right-2 w-5 h-5 items-center justify-center bg-red-500 text-white rounded-full text-[10px] shadow-lg hover:scale-110 transition-transform"
          >
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
      ))}

      {/* Çizim Sırasındaki Dikdörtgen */}
      {currentRect && (
        <div 
          className="absolute border-2 border-dashed border-cyan-400 bg-cyan-400/20 z-30 pointer-events-none"
          style={{
            left: `${currentRect.x}%`,
            top: `${currentRect.y}%`,
            width: `${currentRect.w}%`,
            height: `${currentRect.h}%`,
          }}
        />
      )}
    </div>
  );
};

export default ImageCanvas;
