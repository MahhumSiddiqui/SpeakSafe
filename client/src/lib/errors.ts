import type { TFunction } from 'i18next';
import { ApiError } from './api';

// Server messages are already plain language; our own keys start with "errors.".
export function errorText(e: unknown, t: TFunction): string {
  if (e instanceof ApiError) return e.message.startsWith('errors.') ? t(e.message) : e.message;
  return t('errors.generic');
}
