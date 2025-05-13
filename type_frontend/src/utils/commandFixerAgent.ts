import axios from "axios";

/**
 * A helper function that uses the OpenRouter API to suggest a corrected shell command
 * based on the user's original command and the error message.
 *
 * @param userCommand The original command typed by the user
 * @param errorMessage The error message returned by the shell
 * @returns A promise that resolves to the corrected command as a string
 */
export async function commandFixerAgent(
  userCommand: string,
  errorMessage: string
): Promise<string> {
  // Get the API key from environment variable
  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error(
      "OpenRouter API key not found. Set REACT_APP_OPENROUTER_API_KEY in your environment or .env file."
    );
    return userCommand; // Return original command if API key is not available
  }

  const prompt = `You are an AI assistant that helps users correct invalid shell commands.
Given the user's original command and the shell error message, return only the corrected shell command the user most likely intended to type.

Example format:
User command: node -ver
Error message: /local/bin/node: bad option: -ver

Your response: node -v

Do not add any explanation, markdown, or extra formatting — return only the fixed shell command as plain text.`;

  try {
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
        max_tokens: 50,
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
    const fixedCommand = response.data.choices[0].message.content.trim();
    return fixedCommand;
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    return userCommand; // Return original command on error
  }
}
