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

  console.log("🔄 Command fixer agent called with:", {
    userCommand,
    errorMessage: errorMessage.substring(0, 100), // Truncate long errors
    apiKeyAvailable: !!apiKey,
    timestamp: new Date().toISOString(),
  });

  // Special override for node version errors which are very common
  if (
    (errorMessage.includes("node") && errorMessage.includes("bad option")) ||
    errorMessage.match(/\/.*node:.*bad option/i) !== null
  ) {
    console.log("🔔 Direct override for node version error");
    return [
      {
        command: "node -v",
        description: "Show Node.js version (correct flag)",
      },
      {
        command: "node --version",
        description: "Show Node.js version (long form)",
      },
      { command: "npm -v", description: "Show npm version" },
      { command: "node -h", description: "Show Node.js help" },
    ];
  }

  if (!userCommand || userCommand.trim() === "") {
    console.error("Empty command passed to commandFixerAgent");
    return [
      {
        command: "echo 'No command to fix'",
        description: "No valid command was detected",
      },
    ];
  }

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
        timeout: 10000, // 10-second timeout to prevent hanging
      }
    );

    // Extract the response text from the API response
    console.log("✅ Received OpenRouter API response successfully!");

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      console.error("Invalid API response format:", response.data);
      return defaultSuggestions(userCommand, errorMessage);
    }

    const suggestionsText = response.data.choices[0].message.content.trim();
    console.log("Raw suggestions text:", suggestionsText);

    // Parse the suggestions into an array of command objects
    const suggestions = parseSuggestions(suggestionsText);
    console.log("Parsed suggestions:", suggestions);

    return suggestions.length > 0
      ? suggestions
      : defaultSuggestions(userCommand, errorMessage);
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    return defaultSuggestions(userCommand, errorMessage);
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

/**
 * Provides default suggestions based on common error patterns
 */
function defaultSuggestions(
  userCommand: string,
  errorMessage: string
): CommandSuggestion[] {
  console.log("Generating default suggestions for command:", userCommand);
  console.log("Error message:", errorMessage);

  // Handle "bad option" errors for node commands
  if (
    userCommand.includes("node -ver") ||
    userCommand.includes("node --ver") ||
    (errorMessage.includes("bad option") &&
      (errorMessage.includes("-ver") || errorMessage.includes("node"))) ||
    errorMessage.match(/\/.*node:.*bad option/i) !== null
  ) {
    console.log(
      "🔍 Matched node version flag error pattern - providing direct suggestions"
    );
    return [
      {
        command: "node -v",
        description: "Show Node.js version (correct flag)",
      },
      {
        command: "node --version",
        description: "Show Node.js version (long form)",
      },
      { command: "npm -v", description: "Show npm version" },
      { command: "node -h", description: "Show Node.js help" },
    ];
  }

  // Handle common Git errors
  if (
    userCommand.includes("git") &&
    (errorMessage.includes("not a git repository") ||
      errorMessage.includes("fatal:") ||
      errorMessage.includes("unknown option"))
  ) {
    const suggestions = [];

    if (userCommand.includes("git pull")) {
      suggestions.push(
        { command: "git fetch", description: "Fetch updates without merging" },
        {
          command: "git pull --rebase",
          description: "Pull with rebase instead of merge",
        }
      );
    } else if (userCommand.includes("git push")) {
      suggestions.push(
        {
          command: "git push -u origin HEAD",
          description: "Push current branch setting upstream",
        },
        {
          command: "git push --force-with-lease",
          description: "Force push safely",
        }
      );
    } else if (userCommand.includes("git status")) {
      suggestions.push(
        { command: "git init", description: "Initialize a git repository" },
        { command: "git status -s", description: "Show status in short format" }
      );
    }

    if (suggestions.length > 0) {
      return suggestions;
    }
  }

  // Default suggestion is to return the original command with a note
  return [
    { command: userCommand, description: "No specific suggestions available" },
  ];
}
