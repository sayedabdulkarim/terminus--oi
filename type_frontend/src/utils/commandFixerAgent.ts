/**
 * This file now only contains type definitions for CommandSuggestion.
 * The actual implementation has been moved to the backend.
 */

export interface CommandSuggestion {
  command: string;
  description: string;
}
