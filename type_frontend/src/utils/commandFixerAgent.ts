import axios from "axios";

export interface CommandSuggestion {
  command: string;
  description: string;
}

/**
 * A helper function that uses the OpenRouter API to suggest corrected shell commands
 * based on the user's original command and the error message.
 *
 * @param userCommand The original command typed by the user
 * @param errorMessage The error message returned by the shell
 * @returns A promise that resolves to an array of command suggestions
 */
export async function commandFixerAgent(
  userCommand: string,
  errorMessage: string
): Promise<CommandSuggestion[]> {
  // Get the API key from environment variable
  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;

  console.log("Command fixer agent called with:", {
    userCommand,
    errorMessage,
    apiKeyAvailable: !!apiKey,
  });

  if (!apiKey) {
    console.error(
      "OpenRouter API key not found. Set REACT_APP_OPENROUTER_API_KEY in your environment or .env file."
    );
    return [{ command: userCommand, description: "No API key available" }];
  }

  const prompt = `You are an AI assistant that helps users correct invalid shell commands.
Given the user's original command and the shell error message, suggest multiple valid shell commands the user most likely meant.

Format:
1. <command> → <short description>
2. <command> → <short description>

Do not add explanation or markdown.`;

  try {
    console.log("Making API call to OpenRouter...");

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `User command: ${userCommand}\nError message: ${errorMessage}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.2, // Use a low temperature for more deterministic outputs
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Extract the response text from the API response
    console.log("Received OpenRouter API response");
    const suggestionsText = response.data.choices[0].message.content.trim();
    console.log("Raw suggestions text:", suggestionsText);

    // Parse the suggestions into an array of command objects
    const suggestions = parseSuggestions(suggestionsText);
    console.log("Parsed suggestions:", suggestions);

    return suggestions.length > 0
      ? suggestions
      : [{ command: userCommand, description: "No suggestions available" }];
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    return [{ command: userCommand, description: "Error getting suggestions" }];
  }
}

/**
 * Parses the suggestion text from the model into an array of CommandSuggestion objects
 */
function parseSuggestions(text: string): CommandSuggestion[] {
  const suggestions: CommandSuggestion[] = [];

  // Split by lines and process each line
  const lines = text.split("\n");

  for (const line of lines) {
    // Look for lines with numbered suggestions like "1. command → description"
    const match = line.match(/^\d+\.\s+([^→]+)→\s*(.+)$/);
    if (match) {
      suggestions.push({
        command: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }

  return suggestions;
}
