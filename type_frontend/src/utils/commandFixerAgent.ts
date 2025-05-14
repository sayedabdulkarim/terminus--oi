import axios from "axios";

export interface CommandSuggestion {
  command: string;
  description: string;
}

/**
 * A utility to help identify common command patterns
 * This is used to provide better context to the API
 */
function identifyCommandPattern(commandName: string): string {
  // Check for common command name patterns to help the API
  if (commandName.includes("py")) {
    return "python";
  } else if (commandName.includes("node") || commandName.includes("npm")) {
    return "node";
  } else if (commandName.includes("kube") || commandName.includes("k8s")) {
    return "kubernetes";
  } else if (
    commandName === "mk" ||
    commandName === "mkdi" ||
    commandName === "mkd"
  ) {
    return "mkdir";
  }
  return commandName;
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

  // Command not found handling - if the error indicates command not found
  if (errorMessage.includes("command not found")) {
    // First try to extract the command from shell errors like "zsh: command not found: mk"
    const shellErrorMatch = errorMessage.match(
      /\w+:\s+command not found:\s+(\w+)/i
    );

    let actualCommand = userCommand;

    if (shellErrorMatch && shellErrorMatch[1]) {
      // This matches patterns like "zsh: command not found: mk" where "mk" is the actual command
      actualCommand = shellErrorMatch[1].trim();
      console.log(
        "📍 Extracted actual command from shell error:",
        actualCommand
      );

      // Identify the command pattern to help improve API response
      const commandPattern = identifyCommandPattern(actualCommand);
      if (commandPattern !== actualCommand) {
        console.log(
          `Identified common pattern: '${actualCommand}' might be related to '${commandPattern}'`
        );
      }

      // Update the userCommand to use the actual command that failed
      if (userCommand !== actualCommand) {
        console.log(
          "Updating user command to use the actual command:",
          actualCommand
        );
        userCommand = actualCommand;
      }
    } else {
      // Fall back to the original pattern
      const commandNameMatch = errorMessage.match(
        /([^\s:]+):\s+command not found/
      );
      if (commandNameMatch && commandNameMatch[1]) {
        const commandName = commandNameMatch[1].trim();
        // If the user command contains this same command name, update the user command
        if (
          userCommand === commandName ||
          userCommand.startsWith(commandName + " ")
        ) {
          console.log("📍 Identified command not found for:", commandName);
          actualCommand = commandName;

          // Identify the command pattern to help improve API response
          const commandPattern = identifyCommandPattern(actualCommand);
          if (commandPattern !== actualCommand) {
            console.log(
              `Identified common pattern: '${actualCommand}' might be related to '${commandPattern}'`
            );
          }

          // If userCommand is different, update it
          if (userCommand !== actualCommand) {
            userCommand = actualCommand;
          }
        }
      }
    }

    // For command not found errors, we'll continue to the API call below
    // DO NOT return early here
  }

  // Special handling for "lsas" command - now we'll use the API instead
  if (
    userCommand === "lsas" ||
    (errorMessage.includes("lsas") &&
      errorMessage.includes("command not found"))
  ) {
    console.log("🔍 'lsas' command detected - continuing to API call");
    // Fallthrough to API call instead of returning static suggestions
  }

  // Special handling for node version errors - now using API
  if (
    (errorMessage.includes("node") && errorMessage.includes("bad option")) ||
    errorMessage.match(/\/.*node:.*bad option/i) !== null
  ) {
    console.log("🔔 Node version error detected - using API for suggestions");
    // Continue to API call with the current command
  }

  // Special handling for Python version flag errors - now using API
  if (
    errorMessage === "unknown option --v" ||
    errorMessage.includes("unknown option --v")
  ) {
    console.log(
      "🔔 Python version error with --v detected - using API for suggestions"
    );

    // If the command doesn't include python but the error is python-specific,
    // update the command to include python
    if (!userCommand.includes("python")) {
      console.log(
        `Python error detected but command doesn't include 'python'. Updating command.`
      );
      userCommand = "python --v";
    }

    // Continue to API call with the updated command
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

  const prompt = `You are an AI assistant that helps users correct invalid shell commands.
Given the user's original command and the shell error message, suggest valid alternative shell commands.

User command: ${userCommand}
Error message: ${errorMessage}
${
  userCommand !== identifyCommandPattern(userCommand)
    ? `Possible related command: ${identifyCommandPattern(userCommand)}`
    : ""
}

Respond with multiple corrected shell command suggestions, each followed by a short description. Use this format exactly:
1. <command> → <description>
2. <command> → <description>

Only use the arrow (→) as the separator between command and description. Do not use any other formats.
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
        timeout: 10000, // 10-second timeout to prevent hanging
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
 */
function parseSuggestions(text: string): CommandSuggestion[] {
  const suggestions: CommandSuggestion[] = [];

  // Split by lines and process each line
  const lines = text.split("\n");
  console.log(`🔍 Parsing ${lines.length} lines of suggestions`);

  for (const line of lines) {
    // Try multiple regex patterns to handle different formats
    // 1. Standard format: "1. command → description"
    let match = line.match(/^\d+\.\s+([^→]+)→\s*(.+)$/);

    // 2. Alt format with ":" or "-" instead of "→"
    if (!match) {
      match = line.match(/^\d+\.\s+([^:]+):\s*(.+)$/);
    }

    // 3. Format with "-" as separator
    if (!match) {
      match = line.match(/^\d+\.\s+([^-]+) - \s*(.+)$/);
    }

    // 4. Format where command is in backticks, quotes, or code blocks
    if (!match) {
      match = line.match(/^\d+\.\s+[`'"](.*?)[`'"] +-+ (.+)$/);
    }
    if (match) {
      const command = match[1]
        .trim()
        .replace(/[`'"]/g, "")
        .replace(/^\s*[\w-]+:\s*/, ""); // Remove quotes/backticks and any prefixes
      const description = match[2].trim().replace(/[`'"]/g, "");
      console.log(`✓ Found suggestion: "${command}" → "${description}"`);

      suggestions.push({
        command,
        description,
      });
    } else if (line.trim().length > 0) {
      // If none of the patterns match but the line isn't empty
      const basicMatch = line.match(/^\d+\.\s+(.+)$/);
      if (basicMatch) {
        const fullText = basicMatch[1].trim();
        console.log(`⚠️ Fallback parsing for: "${fullText}"`);

        // Look for command-like patterns (starting with common CLI commands)
        const commandMatch = fullText.match(
          /^(git|node|npm|python|pip|cd|ls|mkdir|rm|cp|mv|echo|cat|ssh|curl|wget|docker|kubectl)(\s+.+)?/i
        );
        if (commandMatch) {
          // If there's space after the command, split into command and description
          if (commandMatch[2] && fullText.indexOf(" ") > 0) {
            const spaceIndex = fullText.indexOf(" ");
            const cmd = fullText.substring(0, spaceIndex);
            const desc = fullText.substring(spaceIndex).trim();
            suggestions.push({
              command: cmd + commandMatch[2],
              description: desc || "Suggested command",
            });
          } else {
            // Just use the whole text as the command
            suggestions.push({
              command: fullText,
              description: "Suggested command",
            });
          }
        } else {
          // No command pattern found, use simple space splitting as last resort
          const spaceIndex = fullText.indexOf(" ");
          if (spaceIndex > 0) {
            suggestions.push({
              command: fullText.substring(0, spaceIndex),
              description: fullText.substring(spaceIndex).trim(),
            });
          } else {
            suggestions.push({
              command: fullText,
              description: "Suggested command",
            });
          }
        }
      } else {
        console.log(`⚠️ Line didn't match any suggestion format: "${line}"`);
      }
    }
  }

  if (suggestions.length === 0) {
    console.log(
      "No structured suggestions found with arrow format. Trying alternative parsing..."
    );

    // Fallback: Look for numbered lines with commands that look like shell commands
    const commandRegex = new RegExp(
      "^\\d+\\.\\s+((?:git|node|npm|python|pip|cd|ls|mkdir|rm|cp|mv|echo|cat|ssh|curl|wget|docker|kubectl)(?:\\s+[\\w\\-\\./ ]+)+)",
      "i"
    );

    for (const line of lines) {
      const commandMatch = line.match(commandRegex);
      if (commandMatch) {
        const command = commandMatch[1].trim();
        console.log(`🔄 Fallback detected command: "${command}"`);
        suggestions.push({
          command: command,
          description:
            line.replace(commandMatch[0], "").trim() || "Suggested command",
        });
      }
    }
  }

  return suggestions;
}

// The defaultSuggestions function has been removed as we now use the API for all suggestions
