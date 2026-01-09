
import { GoogleGenAI, Type } from "@google/genai";

// Vite projelerinde process.env yerine import.meta.env kullanılır.
// Eğer düz bir script ise process.env.API_KEY fallback olarak kalabilir.
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

interface OcrInput {
  id: string;
  originalText: string;
}

export const translateOcrResults = async (
  ocrData: OcrInput[], 
  sourceLang: string, 
  targetLang: string
) => {
  if (ocrData.length === 0) return [];
  if (!apiKey) {
    console.error("API Key bulunamadı! Lütfen .env dosyanızı kontrol edin.");
    return [];
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              text: `You are a professional webtoon translator. 
              Below is a list of texts detected via OCR from a webtoon panel (Source: ${sourceLang}).
              Please provide a natural, high-quality translation for each item into ${targetLang}. 
              Maintain the emotional tone and context of a comic/manga.
              
              OCR DATA:
              ${JSON.stringify(ocrData)}
              
              Return ONLY a valid JSON array of objects with 'id' and 'translatedText' properties.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              translatedText: { type: Type.STRING }
            },
            required: ['id', 'translatedText']
          }
        }
      }
    });

    const jsonStr = response.text?.trim() || '[]';
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Gemini translation error:", e);
    return [];
  }
};
