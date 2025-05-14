import axios from "axios";

export interface CommandSuggestion {
  command: string;
  description: string;
}

/**
 * Generate suggestions for command not found errors
 */
function generateCommandNotFoundSuggestions(
  commandName: string
): CommandSuggestion[] {
  // First check for common typos in command names
  const commonCommands: Record<string, string[]> = {
    // Format: 'typo': ['correct1', 'correct2']
    pyhton: ["python", "python3"],
    pythno: ["python", "python3"],
    ptyhon: ["python", "python3"],
    noed: ["node", "nodejs"],
    nodej: ["node", "nodejs"],
    npn: ["npm"],
    mpm: ["npm"],
    gi: ["git"],
    gt: ["git"],
    gti: ["git"],
    gitt: ["git"],
    igt: ["git"],
    kbuectl: ["kubectl"],
    kubctl: ["kubectl"],
    kubetcl: ["kubectl"],
    kuectl: ["kubectl"],
    kubernets: ["kubernetes"],
    doker: ["docker"],
    dockr: ["docker"],
    dokcer: ["docker"],
    lls: ["ls"],
    sl: ["ls"],
    "cd..": ["cd .."],
    "cd~": ["cd ~"],
    ccd: ["cd"],
    nano: ["vim", "emacs", "nano"],
    vim: ["nano", "vim", "emacs"],
    "code.": ["code ."],
    mk: ["mkdir"],
    mkdi: ["mkdir"],
    mkd: ["mkdir"],
    md: ["mkdir"],
  };

  const suggestions: CommandSuggestion[] = [];

  // Check if the command name is a known typo
  if (commonCommands[commandName]) {
    for (const correctCmd of commonCommands[commandName]) {
      suggestions.push({
        command: correctCmd,
        description: `Try '${correctCmd}' instead of '${commandName}'`,
      });
    }
  }

  // Add some general suggestions based on the command
  if (commandName.includes("py")) {
    suggestions.push(
      {
        command: "python --version",
        description: "Check if Python is installed",
      },
      {
        command: "python3 --version",
        description: "Check if Python 3 is installed",
      },
      { command: "which python", description: "Find Python installation path" }
    );
  } else if (commandName.includes("node") || commandName.includes("npm")) {
    suggestions.push(
      { command: "node -v", description: "Check if Node.js is installed" },
      { command: "npm -v", description: "Check if npm is installed" },
      { command: "which node", description: "Find Node.js installation path" }
    );
  } else if (commandName.includes("kube") || commandName.includes("k8s")) {
    suggestions.push(
      {
        command: "kubectl version",
        description: "Check if kubectl is installed",
      },
      {
        command: "which kubectl",
        description: "Find kubectl installation path",
      }
    );
  } else if (
    commandName === "mk" ||
    commandName === "mkdi" ||
    commandName === "mkd"
  ) {
    // Add suggestions for the specific "mk" or "mkdi" commands
    suggestions.push(
      { command: "mkdir", description: "Create directory (correct command)" },
      { command: "mkdir -p", description: "Create directory with parents" },
      { command: "touch", description: "Create a file instead of a directory" }
    );
  } else {
    // Generic suggestions for unknown commands
    suggestions.push(
      {
        command: `which ${commandName}`,
        description: `Check if ${commandName} is installed`,
      },
      {
        command: "echo $PATH",
        description: "Check your PATH environment variable",
      },
      {
        command: `apt-get install ${commandName}`,
        description: `Try installing ${commandName} (Debian/Ubuntu)`,
      },
      {
        command: `brew install ${commandName}`,
        description: `Try installing ${commandName} (macOS with Homebrew)`,
      }
    );
  }

  return suggestions;
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

    if (shellErrorMatch && shellErrorMatch[1]) {
      // This matches patterns like "zsh: command not found: mk" where "mk" is the actual command
      const actualCommand = shellErrorMatch[1].trim();
      console.log(
        "📍 Extracted actual command from shell error:",
        actualCommand
      );

      // Use the extracted command for suggestions
      const suggestions = generateCommandNotFoundSuggestions(actualCommand);

      // Add a bit of randomness to ensure UI updates
      if (suggestions.length > 1) {
        const randomIndex = Math.floor(Math.random() * suggestions.length);
        const temp = suggestions[0];
        suggestions[0] = suggestions[randomIndex];
        suggestions[randomIndex] = temp;
      }

      return suggestions;
    }

    // Fall back to the original pattern
    const commandNameMatch = errorMessage.match(
      /([^\s:]+):\s+command not found/
    );
    if (commandNameMatch && commandNameMatch[1]) {
      const commandName = commandNameMatch[1].trim();
      // If the user command contains this same command name, provide command not found suggestions
      if (
        userCommand === commandName ||
        userCommand.startsWith(commandName + " ")
      ) {
        console.log(
          "📍 Providing command not found suggestions for:",
          commandName
        );

        // For command not found errors, we want to be more dynamic with suggestions
        // rather than relying on cached responses, so generate fresh suggestions
        // with a slight randomization in the ordering
        const suggestions = generateCommandNotFoundSuggestions(commandName);

        // Add a bit of randomness to the order to ensure UI updates even with same suggestions
        if (suggestions.length > 1) {
          const randomIndex = Math.floor(Math.random() * suggestions.length);
          const temp = suggestions[0];
          suggestions[0] = suggestions[randomIndex];
          suggestions[randomIndex] = temp;
        }

        return suggestions;
      }
    }
  }

  // Special case handling for "lsas" which was mentioned as a problem case
  if (
    userCommand === "lsas" ||
    (errorMessage.includes("lsas") &&
      errorMessage.includes("command not found"))
  ) {
    console.log("🔍 Special handling for 'lsas' command");
    return [
      { command: "ls -a", description: "List all files including hidden ones" },
      { command: "ls -la", description: "List all files in long format" },
      {
        command: "ls -las",
        description: "List all files with size information",
      },
      {
        command:
          "find . -type f | grep -i " + userCommand.replace(/[^a-z0-9]/gi, ""),
        description: "Search for files containing similar name",
      },
    ];
  }

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

  // Special override for Python version flag errors
  if (
    errorMessage === "unknown option --v" ||
    errorMessage.includes("unknown option --v")
  ) {
    console.log("🔔 Direct override for Python version error with --v");

    // If the command doesn't include python but the error is python-specific,
    // force it to be a python command
    const finalCommand = userCommand.includes("python")
      ? userCommand
      : "python --v";

    console.log(`Python error detected. Using command: ${finalCommand}`);

    return [
      {
        command: "python --version",
        description: "Show Python version (full flag)",
      },
      {
        command: "python -V",
        description: "Show Python version (short flag, capital V)",
      },
      { command: "python3 --version", description: "Show Python3 version" },
      { command: "which python", description: "Show Python installation path" },
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
Given the user's original command and the shell error message, suggest valid alternative shell commands.

User command: ${userCommand}
Error message: ${errorMessage}

Respond with multiple corrected shell command suggestions, each followed by a short description. Use this format exactly:
1. <command> → <description>
2. <command> → <description>

Only use the arrow (→) as the separator between command and description. Do not use any other formats.
Do not add any explanation or markdown.`;

  // Log the final prompt being sent
  console.log("🔤 Formatted prompt:", prompt);

  try {
    console.log("Making API call to OpenRouter...");

    // Add a cache-busting timestamp to prevent any HTTP-level caching
    const cacheBuster = Date.now();

    const response = await axios.post(
      `https://openrouter.ai/api/v1/chat/completions?_=${cacheBuster}`,
      {
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.2, // Use a low temperature for more deterministic outputs
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store",
          Pragma: "no-cache",
          "If-None-Match": `${cacheBuster}`, // Prevent 304 responses
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

/**
 * Provides default suggestions based on common error patterns
 */
function defaultSuggestions(
  userCommand: string,
  errorMessage: string
): CommandSuggestion[] {
  console.log("Generating default suggestions for command:", userCommand);
  console.log("Error message:", errorMessage);

  // Extract actual command for shell error messages
  let actualCommand = userCommand;
  const shellErrorMatch = errorMessage.match(
    /\w+:\s+command not found:\s+(\w+)/i
  );
  if (shellErrorMatch && shellErrorMatch[1]) {
    actualCommand = shellErrorMatch[1].trim();
    console.log(
      "Extracted actual command from error message for default suggestions:",
      actualCommand
    );
  }

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

  // Handle Python command errors
  if (
    (userCommand.includes("python") ||
      userCommand.includes("python3") ||
      errorMessage.includes("unknown option --v")) &&
    (errorMessage.includes("unknown option") ||
      errorMessage.includes("invalid option") ||
      errorMessage.includes("--v") ||
      errorMessage.includes("-ver"))
  ) {
    console.log(
      "🐍 Matched Python command error - providing Python-specific suggestions"
    );
    return [
      {
        command: "python --version",
        description: "Show Python version (full flag)",
      },
      { command: "python -V", description: "Show Python version (short flag)" },
      {
        command: "python3 --version",
        description: "Show Python3 version (full flag)",
      },
      {
        command: "python3 -V",
        description: "Show Python3 version (short flag)",
      },
      { command: "which python", description: "Show Python installation path" },
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

  // Handle specific command typos
  if (
    actualCommand === "mk" ||
    actualCommand === "mkdi" ||
    actualCommand === "mkd"
  ) {
    return [
      { command: "mkdir", description: "Create directory (correct command)" },
      { command: "mkdir -p", description: "Create directory with parents" },
      { command: "touch", description: "Create a file instead of a directory" },
    ];
  }

  // Default suggestion is to return the original command with a note
  return [
    {
      command: actualCommand === userCommand ? userCommand : actualCommand,
      description: "No specific suggestions available",
    },
  ];
}
