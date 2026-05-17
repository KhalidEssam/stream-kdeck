import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiRouterService {
  async call(prompt: string, context: string): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error(
        'No AI provider configured. Set GEMINI_API_KEY in environment or .env file.'
      );
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const fullPrompt = context
      ? `Clipboard content:\n${context}\n\nInstruction:\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    return result.response.text();
  }
}
