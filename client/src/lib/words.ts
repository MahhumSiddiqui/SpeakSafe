import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sodium } from './keys';

const ADJ = ['calm','quiet','gentle','bright','brave','kind','steady','clear','soft','warm','silver','golden','misty','sunny','still','swift','wise','bold','green','blue','amber','coral','ivory','olive','sandy','lunar','solar','cosy','fresh','light'];
const NOUN = ['river','lake','leaf','cloud','stone','meadow','harbor','willow','sparrow','maple','ocean','garden','pebble','breeze','lantern','forest','island','valley','comet','feather','orchid','cedar','reed','shore','falcon','heron','tulip','lotus','jasmine','palm'];

/** A made-up username such as "quiet-river-42" (unbiased random choices). */
export async function suggestUsername(): Promise<string> {
  const s = await sodium();
  const pick = (a: string[]) => a[s.randombytes_uniform(a.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${10 + s.randombytes_uniform(90)}`;
}

/** 6 words from the 2048-word BIP-39 list: about 66 bits of randomness. */
export async function newRecoveryWords(count = 6): Promise<string[]> {
  const s = await sodium();
  return Array.from({ length: count }, () => wordlist[s.randombytes_uniform(wordlist.length)]);
}

export const isRecoveryWord = (w: string) => wordlist.includes(w.trim().toLowerCase());

/** Rough password strength 0–4: length counts most; simple patterns count against. */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (pw.length >= 18 || (/\s|-/.test(pw) && pw.length >= 14)) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) score++;
  if (/^(.)\1+$/.test(pw) || /^(?:password|qwerty|123456|speaksafe)/i.test(pw)) score = 0;
  return Math.min(score, 4);
}
