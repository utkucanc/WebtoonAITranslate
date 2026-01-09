
import React, { useState, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { WebtoonImage, AppMode, TextRegion, SUPPORTED_LANGUAGES } from './types';
import { translateOcrResults } from './services/geminiService';
import ImageCanvas from './components/ImageCanvas';

const App: React.FC = () => {
  const [images, setImages] = useState<WebtoonImage[]>([]);
  const [mergedImage, setMergedImage] = useState<{ url: string, regions: TextRegion[] } | null>(null);
  const [sourceLang, setSourceLang] = useState('Korean');
  const [targetLang, setTargetLang] = useState('Turkish');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);

  // Bellek sızıntısını önlemek için ObjectURL'leri temizle
  useEffect(() => {
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
      if (mergedImage) URL.revokeObjectURL(mergedImage.url);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    const newImages: WebtoonImage[] = await Promise.all(files.map(async (file) => {
      const url = URL.createObjectURL(file);
      const dimensions = await new Promise<{w: number, h: number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.src = url;
      });

      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: url,
        regions: [],
        isProcessing: false,
        status: 'idle' as const,
        width: dimensions.w,
        height: dimensions.h
      };
    }));

    setImages(prev => [...prev, ...newImages]);
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...images];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= images.length) return;
    [newImages[index], newImages[target]] = [newImages[target], newImages[index]];
    setImages(newImages);
  };

  const mergeImagesOnly = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Paneller birleştiriliyor...');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = Math.max(...images.map(img => img.width || 0));
    const totalHeight = images.reduce((sum, img) => sum + (img.height || 0), 0);

    canvas.width = maxWidth;
    canvas.height = totalHeight;

    let currentY = 0;
    for (const imgData of images) {
      const img = new Image();
      img.src = imgData.previewUrl;
      await new Promise(r => img.onload = r);
      ctx.drawImage(img, 0, currentY, imgData.width!, imgData.height!);
      currentY += imgData.height!;
    }

    const mergedUrl = canvas.toDataURL('image/jpeg', 0.95);
    setMergedImage({ url: mergedUrl, regions: [] });
    setMode(AppMode.MERGED_EDITOR);
    setIsProcessing(false);
    setProcessingStatus('');
  };

  const runOcrOnSelectedRegions = async () => {
    if (!mergedImage || mergedImage.regions.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Korece OCR motoru hazırlanıyor...');

    const langCodeMap: Record<string, string> = { 'Korean': 'kor', 'English': 'eng', 'Japanese': 'jpn', 'Chinese': 'chi_sim', 'Turkish': 'tur' };
    const targetLangCode = langCodeMap[sourceLang] || 'kor';

    try {
      const worker = await createWorker(targetLangCode);

      const updatedRegions = [...mergedImage.regions].sort((a,b) => a.order - b.order);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const sourceImg = new Image();
      sourceImg.src = mergedImage.url;
      await new Promise(r => sourceImg.onload = r);

      for (let i = 0; i < updatedRegions.length; i++) {
        setProcessingStatus(`Okunuyor: Kutu ${i + 1}/${updatedRegions.length}`);
        const region = updatedRegions[i];
        const rx = (region.x / 100) * sourceImg.width;
        const ry = (region.y / 100) * sourceImg.height;
        const rw = (region.width / 100) * sourceImg.width;
        const rh = (region.height / 100) * sourceImg.height;

        canvas.width = rw;
        canvas.height = rh;
        ctx?.drawImage(sourceImg, rx, ry, rw, rh, 0, 0, rw, rh);
        
        const { data: { text } } = await worker.recognize(canvas.toDataURL());
        updatedRegions[i].originalText = text.trim();
      }

      await worker.terminate();
      setMergedImage({ ...mergedImage, regions: updatedRegions });
    } catch (err) {
      console.error("OCR Hatası:", err);
      alert("OCR işlemi sırasında bir hata oluştu.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const runAiTranslation = async () => {
    if (!mergedImage || mergedImage.regions.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Gemini API Çevirisi yapılıyor...');

    try {
      const translations = await translateOcrResults(
        mergedImage.regions.map(r => ({ id: r.id, originalText: r.originalText })),
        sourceLang,
        targetLang
      );

      const updatedRegions = mergedImage.regions.map(r => {
        const trans = translations.find((t: any) => t.id === r.id);
        return trans ? { ...r, translatedText: trans.translatedText } : r;
      });

      setMergedImage({ ...mergedImage, regions: updatedRegions });
    } catch (error) {
      console.error(error);
      alert("Çeviri sırasında bir hata oluştu.");
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const updateRegion = (id: string, updates: Partial<TextRegion>) => {
    if (!mergedImage) return;
    setMergedImage({
      ...mergedImage,
      regions: mergedImage.regions.map(r => r.id === id ? { ...r, ...updates } : r)
    });
  };

  const addRegion = (data: Omit<TextRegion, 'id' | 'order'>) => {
    if (!mergedImage) return;
    const newRegion: TextRegion = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      order: mergedImage.regions.length + 1
    };
    setMergedImage({
      ...mergedImage,
      regions: [...mergedImage.regions, newRegion]
    });
    setSelectedRegionId(newRegion.id);
  };

  const removeRegion = (id: string) => {
    if (!mergedImage) return;
    const newRegions = mergedImage.regions
      .filter(r => r.id !== id)
      .map((r, i) => ({ ...r, order: i + 1 }));
    setMergedImage({ ...mergedImage, regions: newRegions });
    setSelectedRegionId(null);
  };

  const downloadFinal = async () => {
    if (!mergedImage) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = mergedImage.url;
    await new Promise(r => img.onload = r);
    canvas.width = img.width;
    canvas.height = img.height;
    ctx?.drawImage(img, 0, 0);

    mergedImage.regions.forEach(r => {
      if (!ctx) return;
      const rx = (r.x / 100) * canvas.width;
      const ry = (r.y / 100) * canvas.height;
      const rw = (r.width / 100) * canvas.width;
      const rh = (r.height / 100) * canvas.height;

      ctx.fillStyle = 'white';
      ctx.fillRect(rx, ry, rw, rh);

      ctx.fillStyle = 'black';
      const fontSize = Math.max(12, rh * 0.15);
      ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const text = r.translatedText || r.originalText;
      if (!text) return;

      const words = text.split(' ');
      let line = '';
      let lines = [];
      for(let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > rw * 0.85 && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      const lineHeight = fontSize * 1.2;
      const startY = ry + (rh / 2) - ((lines.length - 1) * lineHeight / 2);

      lines.forEach((l, i) => {
        ctx.fillText(l, rx + rw / 2, startY + (i * lineHeight));
      });
    });

    const link = document.createElement('a');
    link.download = `webtoon_final_${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
              <i className="fa-solid fa-wand-magic-sparkles text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Webtoon<span className="text-blue-400">Master</span></h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">AI Driven Localization</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center bg-slate-800 rounded-xl p-1.5 border border-slate-700 shadow-inner">
               <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase">Diller:</div>
               <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="bg-slate-900 text-xs font-bold px-3 py-1 rounded-lg outline-none border border-slate-700">
                {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
              </select>
              <i className="fa-solid fa-chevron-right text-[10px] text-slate-600 mx-2"></i>
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="bg-slate-900 text-xs font-bold px-3 py-1 rounded-lg outline-none border border-slate-700">
                {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
        {mode === AppMode.UPLOAD ? (
          <div className="flex flex-col gap-10">
            <div className="relative group">
               <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
               <div className="relative border-4 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/50 p-16 text-center hover:bg-slate-900/80 transition-all cursor-pointer">
                <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                    <i className="fa-solid fa-cloud-arrow-up text-4xl text-blue-500"></i>
                  </div>
                  <h2 className="text-3xl font-black mb-3">Webtoon Bölümü Hazırla</h2>
                  <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto leading-relaxed">Çevirmek istediğiniz sayfaları yükleyin. Sıralamayı sürükleyerek ayarlayabilirsiniz.</p>
                  <span className="px-10 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-sm shadow-2xl shadow-blue-600/40 inline-block transition-all active:scale-95">Dosyaları Tara</span>
                </label>
              </div>
            </div>

            {images.length > 0 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <h3 className="font-black text-slate-500 uppercase tracking-widest text-sm flex items-center gap-2">
                    <i className="fa-solid fa-list-ol"></i> SAYA SIRALAMASI ({images.length})
                  </h3>
                  <button 
                    onClick={mergeImagesOnly} 
                    disabled={isProcessing}
                    className="px-8 py-4 bg-white text-black rounded-2xl font-black text-sm hover:bg-blue-50 transition-all flex items-center gap-3 shadow-xl active:scale-95 disabled:opacity-50"
                  >
                    {isProcessing ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-layer-group"></i>}
                    BİRLEŞTİR VE EDİTÖRE GEÇ
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                  {images.map((img, idx) => (
                    <div key={img.id} className="relative group rounded-2xl overflow-hidden border-2 border-slate-800 hover:border-blue-500 transition-all shadow-2xl bg-slate-900">
                      <img src={img.previewUrl} className="w-full aspect-[3/4] object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-4 gap-3">
                         <div className="flex gap-2 w-full">
                           <button onClick={() => moveImage(idx, 'up')} className="flex-1 h-10 bg-slate-800/90 rounded-xl flex items-center justify-center hover:bg-blue-600 transition-colors"><i className="fa-solid fa-chevron-left"></i></button>
                           <button onClick={() => moveImage(idx, 'down')} className="flex-1 h-10 bg-slate-800/90 rounded-xl flex items-center justify-center hover:bg-blue-600 transition-colors"><i className="fa-solid fa-chevron-right"></i></button>
                         </div>
                         <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="w-full h-10 bg-red-600/90 rounded-xl text-xs font-black hover:bg-red-500 transition-colors">SİL</button>
                      </div>
                      <div className="absolute top-3 left-3 bg-blue-600 text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg">SAYFA {idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-10 h-full animate-in fade-in zoom-in-95 duration-500">
            <div className="flex-1 bg-slate-900/30 rounded-[2.5rem] p-6 border border-slate-800 overflow-auto max-h-[calc(100vh-200px)] shadow-2xl custom-scrollbar">
               <div className="max-w-3xl mx-auto">
                <ImageCanvas 
                  imageUrl={mergedImage!.url}
                  regions={mergedImage!.regions}
                  onAddRegion={addRegion}
                  onUpdateRegion={updateRegion}
                  onRemoveRegion={removeRegion}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={setSelectedRegionId}
                />
               </div>
            </div>

            <aside className="w-full lg:w-[450px] flex flex-col gap-8 shrink-0">
              <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-8 sticky top-24">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">İş Akış Paneli</h4>
                    <span className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-bold text-slate-500">{mergedImage?.regions.length} Kutucuk</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={runOcrOnSelectedRegions} 
                      disabled={isProcessing || mergedImage?.regions.length === 0}
                      className="group relative flex flex-col items-center gap-3 p-5 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 rounded-3xl border border-slate-700 transition-all hover:border-blue-500/50 shadow-xl"
                    >
                      <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-magnifying-glass text-blue-400 text-xl"></i>
                      </div>
                      <span className="text-[10px] font-black tracking-widest uppercase">1. OCR OKU</span>
                    </button>

                    <button 
                      onClick={runAiTranslation} 
                      disabled={isProcessing || mergedImage?.regions.length === 0}
                      className="group relative flex flex-col items-center gap-3 p-5 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 rounded-3xl border border-slate-700 transition-all hover:border-purple-500/50 shadow-xl"
                    >
                      <div className="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-language text-purple-400 text-xl"></i>
                      </div>
                      <span className="text-[10px] font-black tracking-widest uppercase">2. AI ÇEVİR</span>
                    </button>
                  </div>

                  {isProcessing && (
                    <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-4 animate-pulse">
                      <i className="fa-solid fa-circle-notch fa-spin text-blue-400"></i>
                      <span className="text-xs font-bold text-blue-200">{processingStatus}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-8">
                  {selectedRegionId ? (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      {(() => {
                        const region = mergedImage!.regions.find(r => r.id === selectedRegionId)!;
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-blue-400 bg-blue-400/10 px-3 py-1 rounded-lg"># {region.order} NUMARALI KUTU</span>
                              <button onClick={() => removeRegion(region.id)} className="text-[10px] font-black text-red-500 hover:text-red-400 flex items-center gap-2">
                                <i className="fa-solid fa-trash"></i> SİL
                              </button>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Kaynak Metin (Korece)</label>
                              <textarea 
                                value={region.originalText} 
                                onChange={e => updateRegion(region.id, { originalText: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs focus:border-blue-500 outline-none resize-none min-h-[80px] shadow-inner"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase">AI Çeviri (Türkçe)</label>
                              <textarea 
                                value={region.translatedText} 
                                onChange={e => updateRegion(region.id, { translatedText: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs focus:border-purple-500 outline-none resize-none min-h-[100px] font-bold text-blue-400 shadow-inner"
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-950/50 rounded-3xl border border-slate-800/50 border-dashed">
                      <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                        <i className="fa-solid fa-i-cursor text-2xl"></i>
                      </div>
                      <p className="text-xs font-bold text-slate-500 max-w-[200px] mx-auto leading-relaxed">Görsel üzerinde sürükleyerek yeni bir kutu çizin veya düzenlemek için birine tıklayın.</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={downloadFinal} 
                    disabled={mergedImage?.regions.length === 0 || isProcessing}
                    className="w-full py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-30 rounded-3xl font-black text-sm shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    <i className="fa-solid fa-download"></i> GÖRSELİ DIŞA AKTAR
                  </button>
                  <button 
                    onClick={() => setMode(AppMode.UPLOAD)} 
                    className="py-3 text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                  >
                    Yeni Bölüme Başla
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
