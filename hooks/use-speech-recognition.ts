"use client";

/**
 * Ditado por voz usando a Web Speech API do navegador.
 *
 * Sem chave e sem servidor: o reconhecimento é do próprio navegador. Só existe
 * no Chrome e no Edge (`webkitSpeechRecognition`) — no Firefox e no Safari o
 * hook devolve `supported: false` e a interface esconde o botão.
 *
 * Duas decisões que vieram de como a fala real acontece:
 *
 *   * `continuous` ligado, porque ditar um gasto tem pausa no meio
 *     ("paguei... duzentos e quarenta... no mercado") e sem isso o navegador
 *     encerra na primeira pausa.
 *   * O texto final é acumulado em `finalRef`, e o provisório só se soma na
 *     leitura. O navegador reenvia o trecho provisório a cada correção, então
 *     concatenar tudo direto duplicaria palavras.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Recorte da Web Speech API — não está no lib.dom de todas as versões. */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGE: Record<string, string> = {
  "not-allowed":
    "O navegador bloqueou o microfone. Libere o acesso e tente de novo.",
  "service-not-allowed":
    "O navegador bloqueou o microfone. Libere o acesso e tente de novo.",
  "no-speech": "Não ouvi nada. Tente falar mais perto do microfone.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "O reconhecimento de voz precisa de internet.",
  aborted: "",
};

interface UseSpeechRecognition {
  /** Se este navegador tem a API. */
  supported: boolean;
  listening: boolean;
  /** Texto reconhecido até agora, já com o trecho provisório. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(lang = "pt-BR"): UseSpeechRecognition {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  // A checagem fica num efeito: no servidor não existe `window`, e decidir
  // isso na primeira renderização quebraria a hidratação.
  useEffect(() => {
    setSupported(getConstructor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    setError(null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) {
      setError("Este navegador não reconhece voz. Use o Chrome ou o Edge.");
      return;
    }

    // Uma sessão por vez: começar de novo sem encerrar a anterior faz o
    // navegador lançar InvalidStateError.
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalRef.current += text;
        else pending += text;
      }
      setFinalText(finalRef.current);
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGE[event.error];
      // `aborted` é o encerramento normal de quem clica em parar.
      setError(message ?? `Falha no reconhecimento de voz (${event.error}).`);
      setListening(false);
    };

    recognition.onend = () => {
      setInterim("");
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setInterim("");
    recognition.start();
    setListening(true);
  }, [lang]);

  // Um reconhecimento vivo depois da tela sair deixa o microfone aberto.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  const transcript = [finalText, interim].filter(Boolean).join(" ");

  return { supported, listening, transcript, error, start, stop, reset };
}
