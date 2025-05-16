import axios from "axios";

export interface CommandSuggestion {
  command: string;
  description: string;
}

/**
 * A helper function that uses the OpenRouter API to suggest corrected commands
 * based on the user's original input, exit code, and error output.
 * This function is generic and works with any command type (shell, Python, Node.js, etc.).
 *
 * @param userCommand The original input typed by the user
 * @param exitCode The exit code of the command (0 = success, non-zero = failure)
 * @param stderr The error output from the command execution
 * @returns A promise that resolves to an array of command suggestions
 */
export async function commandFixerAgent(
  userCommand: string,
  exitCode: number,
  stderr: string
): Promise<CommandSuggestion[]> {
  // Get the API key from environment variable
  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;

  console.log("🔄 Command fixer agent called with:", {
    userCommand,
    exitCode,
    stderr: stderr.substring(0, 100), // Truncate long errors
    apiKeyAvailable: !!apiKey,
    timestamp: new Date().toISOString(),
  });

  // If the command is valid (exitCode === 0 and no stderr), return early
  if (exitCode === 0 && !stderr.trim()) {
    console.log("Command is valid. No suggestions needed.");
    return [
      {
        command: "Command is valid. No suggestions needed.",
        description: "",
      },
    ];
  }

  if (!userCommand || userCommand.trim() === "") {
    console.error("Empty command passed to commandFixerAgent");
    throw new Error("Empty command passed to commandFixerAgent");
  }

  if (!apiKey) {
    console.error(
      "OpenRouter API key not found. Set REACT_APP_OPENROUTER_API_KEY in your environment or .env file."
    );
    throw new Error(
      "API key not found. Please configure the API key in your environment."
    );
  }

  const prompt = `You are an AI assistant that helps users correct invalid or failed commands across terminal environments (e.g., shell, Python, Node.js, CLI tools).
Given the user's original command, its exit code, and the error message, suggest valid alternative commands.

User command: ${userCommand}
Exit code: ${exitCode}
Error message: ${stderr.trim() || `Command failed with exit code ${exitCode}`}

Remember that a non-zero exit code (${exitCode}) indicates failure, even if there's no clear error message.

Respond with multiple corrected commands in this format:
<corrected command> ~ <short description>

If the command is valid, respond with:
Command is valid. No suggestions needed.

Do not add any explanation or markdown.`;

  // Log the final prompt being sent
  console.log("🔤 Formatted prompt:", prompt);

  try {
    console.log("Making API call to OpenRouter via backend proxy...");

    // Use our backend proxy to avoid CORS issues
    const response = await axios.post(
      "http://localhost:3001/api/proxy/openrouter",
      {
        prompt: prompt,
        apiKey: apiKey,
        model: "anthropic/claude-3.5-sonnet",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000, // 15-second timeout to accommodate more complex commands
      }
    );

    // Extract the response text from the API response
    console.log("✅ Received OpenRouter API response successfully!");

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      console.error("Invalid API response format:", response.data);
      throw new Error("Invalid API response format");
    }

    const suggestionsText = response.data.choices[0].message.content.trim();
    console.log("Raw suggestions text:", suggestionsText);

    // Parse the suggestions into an array of command objects
    const suggestions = parseSuggestions(suggestionsText);
    console.log("Parsed suggestions:", suggestions);

    if (suggestions.length === 0) {
      console.warn("No suggestions could be parsed from API response");
      // Return an empty array instead of falling back to default suggestions
      return [
        {
          command: "echo 'Unable to parse suggestions'",
          description: "Try a different command or check API response format",
        },
      ];
    }

    return suggestions;
  } catch (error: unknown) {
    console.error("Error calling OpenRouter API:", error);
    // Instead of returning default suggestions, throw the error to be handled by the caller
    throw error;
  }
}

/**
 * Parses the suggestion text from the model into an array of CommandSuggestion objects
 * Handles any command type (shell, Python, Node.js, etc.)
 */
function parseSuggestions(text: string): CommandSuggestion[] {
  const suggestions: CommandSuggestion[] = [];

  // Special case for "Command is valid" response
  if (text.includes("Command is valid. No suggestions needed.")) {
    console.log("Command is valid message detected");
    return [
      {
        command: "Command is valid. No suggestions needed.",
        description: "",
      },
    ];
  }

  // Split by lines and process each line
  const lines = text.split("\n");
  console.log(`🔍 Parsing ${lines.length} lines of suggestions`);

  for (const line of lines) {
    if (line.trim().length === 0) continue;

    // Use the tilde separator format: command ~ description
    const match = line.match(/^(.+?)\s*~\s*(.+)$/);
    if (match) {
      const command = match[1].trim();
      const description = match[2].trim();
      console.log(`✓ Found suggestion: "${command}" ~ "${description}"`);

      suggestions.push({
        command,
        description,
      });
    } else {
      console.log(`⚠️ Line didn't match expected format: "${line}"`);

      // Simple fallback: if there's a tilde anywhere in the line
      const tildeIndex = line.indexOf("~");
      if (tildeIndex > 0) {
        const command = line.substring(0, tildeIndex).trim();
        const description = line.substring(tildeIndex + 1).trim();

        if (command.length > 0) {
          console.log(`🔄 Fallback parsing: "${command}" ~ "${description}"`);
          suggestions.push({
            command,
            description: description || "Suggested command",
          });
        }
      }
    }
  }

  return suggestions;
}
